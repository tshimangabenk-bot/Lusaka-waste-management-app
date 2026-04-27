"""
Authentication API — register, login, refresh, logout, Firebase token exchange.
"""
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
)

from app import db
from app.models import User, UserReward
from app.schemas import UserSchema, UserCreateSchema, LoginSchema
from app import firebase

auth_bp = Blueprint("auth", __name__)
user_schema = UserSchema()
user_create_schema = UserCreateSchema()
login_schema = LoginSchema()


@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user (resident, collector, or admin)."""
    data = user_create_schema.load(request.get_json())

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(
        email=data["email"],
        phone=data.get("phone"),
        password_hash=generate_password_hash(data["password"]),
        first_name=data["first_name"],
        last_name=data["last_name"],
        role=data.get("role", "resident"),
        compound=data.get("compound"),
    )

    # Set GPS location if provided
    if data.get("latitude") and data.get("longitude"):
        user.latitude  = data["latitude"]
        user.longitude = data["longitude"]

    db.session.add(user)
    db.session.flush()

    # Initialise reward balance for residents
    if user.role == "resident":
        db.session.add(UserReward(user_id=user.id, total_points=0, lifetime_points=0))

    db.session.commit()

    access_token  = create_access_token(identity=user.id, additional_claims={"role": user.role})
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "message": "Registration successful",
        "user": user_schema.dump(user),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate and return JWT tokens."""
    data = login_schema.load(request.get_json())
    user = User.query.filter_by(email=data["email"]).first()

    if not user or not check_password_hash(user.password_hash, data["password"]):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account deactivated. Contact LCC admin."}), 403

    access_token  = create_access_token(identity=user.id, additional_claims={"role": user.role})
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "user": user_schema.dump(user),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Issue a new access token using a valid refresh token."""
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)
    access_token = create_access_token(identity=user_id, additional_claims={"role": user.role})
    return jsonify({"access_token": access_token}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return the current authenticated user's profile."""
    user = User.query.get_or_404(get_jwt_identity())
    return jsonify(user_schema.dump(user)), 200


@auth_bp.route("/firebase-login", methods=["POST"])
def firebase_login():
    """Exchange a Firebase ID token for app JWT tokens.

    Frontend flow:
      1. User signs in via Firebase SDK (Google, phone, email/password).
      2. Frontend calls  firebaseUser.getIdToken()  and POSTs it here.
      3. Backend verifies the token, finds-or-creates the local User row,
         and returns the same JWT pair used everywhere else in the API.
    """
    if not firebase.is_enabled():
        return jsonify({"error": "Firebase is not configured on this server"}), 503

    body = request.get_json(silent=True) or {}
    id_token = body.get("id_token")
    if not id_token:
        return jsonify({"error": "id_token is required"}), 400

    try:
        decoded = firebase.verify_id_token(id_token)
    except Exception as exc:
        return jsonify({"error": "Invalid Firebase token", "detail": str(exc)}), 401

    email   = decoded.get("email", "")
    name    = decoded.get("name", "") or ""
    picture = decoded.get("picture")

    # Find existing user or auto-create one from Firebase profile
    user = User.query.filter_by(email=email).first() if email else None
    if not user:
        parts      = name.split(" ", 1)
        first_name = parts[0] if parts else (email.split("@")[0] if email else "User")
        last_name  = parts[1] if len(parts) > 1 else ""
        user = User(
            email=email,
            # Store Firebase UID as a non-usable password hash so the row is valid
            password_hash=generate_password_hash(decoded["uid"]),
            first_name=first_name,
            last_name=last_name,
            profile_image=picture,
            is_verified=True,
        )
        db.session.add(user)
        db.session.flush()
        db.session.add(UserReward(user_id=user.id, total_points=0, lifetime_points=0))
        db.session.commit()

    access_token  = create_access_token(identity=user.id, additional_claims={"role": user.role})
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "message": "Firebase login successful",
        "user": user_schema.dump(user),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 200
