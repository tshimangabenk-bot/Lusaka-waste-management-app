"""
User-facing API — resident dashboard summary, notifications, FCM token,
and admin user management.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db, firebase
from app.models import User, UserReward, Report, UserNotification, RewardTransaction
from app.schemas import UserSchema

users_bp = Blueprint("users", __name__)


@users_bp.route("/me/dashboard", methods=["GET"])
@jwt_required()
def my_dashboard():
    """Aggregate all data the resident dashboard needs in one request."""
    user_id = get_jwt_identity()
    user    = User.query.get_or_404(user_id)
    reward  = UserReward.query.filter_by(user_id=user_id).first()

    # Report stats
    q        = Report.query.filter_by(reporter_id=user_id)
    total    = q.count()
    pending  = q.filter_by(status="pending").count()
    resolved = q.filter_by(status="resolved").count()

    recent_reports = (
        Report.query
        .filter_by(reporter_id=user_id)
        .order_by(Report.created_at.desc())
        .limit(5)
        .all()
    )

    recent_txns = (
        RewardTransaction.query
        .filter_by(user_id=user_id)
        .order_by(RewardTransaction.created_at.desc())
        .limit(5)
        .all()
    )

    notifs = (
        UserNotification.query
        .filter_by(user_id=user_id)
        .order_by(UserNotification.created_at.desc())
        .limit(10)
        .all()
    )

    return jsonify({
        "user": {
            "first_name":  user.first_name,
            "last_name":   user.last_name,
            "email":       user.email,
            "compound":    user.compound,
            "is_verified": user.is_verified,
        },
        "rewards": {
            "total_points":    reward.total_points    if reward else 0,
            "lifetime_points": reward.lifetime_points if reward else 0,
        },
        "report_stats": {
            "total":    total,
            "pending":  pending,
            "resolved": resolved,
        },
        "recent_reports": [
            {
                "id":          r.id,
                "category":    r.category,
                "description": r.description,
                "status":      r.status,
                "address":     r.address,
                "created_at":  r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent_reports
        ],
        "recent_transactions": [
            {
                "id":          t.id,
                "description": t.description,
                "points":      t.points,
                "created_at":  t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent_txns
        ],
        "notifications": [
            {
                "id":         n.id,
                "title":      n.title,
                "body":       n.body,
                "is_read":    n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifs
        ],
    }), 200


@users_bp.route("/me/notifications", methods=["GET"])
@jwt_required()
def my_notifications():
    """Return all notifications for the current user."""
    user_id = get_jwt_identity()
    notifs = (
        UserNotification.query
        .filter_by(user_id=user_id)
        .order_by(UserNotification.created_at.desc())
        .all()
    )
    return jsonify([
        {
            "id":         n.id,
            "title":      n.title,
            "body":       n.body,
            "is_read":    n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]), 200


@users_bp.route("/me/notifications/mark-all-read", methods=["PATCH"])
@jwt_required()
def mark_all_notifications_read():
    user_id = get_jwt_identity()
    UserNotification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All notifications marked as read"}), 200


@users_bp.route("/me/fcm-token", methods=["PUT"])
@jwt_required()
def register_fcm_token():
    """Store or update the FCM device token for push notifications.

    Frontend should call this after signing in and after the FCM SDK
    returns a new registration token (token refresh events).

    Body: { "fcm_token": "<device token string>" }
    """
    user_id = get_jwt_identity()
    body    = request.get_json(silent=True) or {}
    token   = body.get("fcm_token", "").strip()

    if not token:
        return jsonify({"error": "fcm_token is required"}), 400

    user = User.query.get_or_404(user_id)
    user.fcm_token = token
    db.session.commit()
    return jsonify({"message": "FCM token registered"}), 200


# ── Admin user management ──────────────────────────────────────────────────────

_user_schema  = UserSchema()
_users_schema = UserSchema(many=True)


@users_bp.route("", methods=["GET"])
@jwt_required()
def list_users():
    """Admin: list all users with optional role filter."""
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    role = request.args.get("role")
    query = User.query
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.created_at.desc()).all()
    return jsonify(_users_schema.dump(users)), 200


@users_bp.route("/<string:user_id>", methods=["PUT"])
@jwt_required()
def update_user(user_id):
    """Admin: update any user's profile or role."""
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    for field in ("first_name", "last_name", "phone", "role", "compound", "is_active"):
        if field in data:
            setattr(user, field, data[field])

    db.session.commit()
    return jsonify(_user_schema.dump(user)), 200
