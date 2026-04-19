"""
Citizen Reports API — report illegal dumping, overflowing bins, etc.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from datetime import datetime, timezone

from app import db
from app.models import Report, ReportImage, RewardTransaction, UserReward
from app.schemas import ReportSchema, ReportCreateSchema

reports_bp = Blueprint("reports", __name__)
report_schema = ReportSchema()
reports_schema = ReportSchema(many=True)
report_create_schema = ReportCreateSchema()

REWARD_POINTS_PER_REPORT = 10


def _enrich(report_obj: Report) -> dict:
    data = report_schema.dump(report_obj)
    if report_obj.location:
        pt = to_shape(report_obj.location)
        data["latitude"] = pt.y
        data["longitude"] = pt.x
    return data


@reports_bp.route("", methods=["GET"])
@jwt_required()
def list_reports():
    """List reports — admins see all, residents see only their own."""
    claims = get_jwt()
    query = Report.query

    if claims.get("role") == "resident":
        query = query.filter_by(reporter_id=get_jwt_identity())

    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)

    zone_id = request.args.get("zone_id", type=int)
    if zone_id:
        query = query.filter_by(zone_id=zone_id)

    reports = query.order_by(Report.created_at.desc()).all()
    return jsonify([_enrich(r) for r in reports]), 200


@reports_bp.route("/<string:report_id>", methods=["GET"])
@jwt_required()
def get_report(report_id):
    report = Report.query.get_or_404(report_id)
    return jsonify(_enrich(report)), 200


@reports_bp.route("", methods=["POST"])
@jwt_required()
def create_report():
    """Submit a new citizen report with GPS location."""
    user_id = get_jwt_identity()
    data = report_create_schema.load(request.get_json())

    report = Report(
        reporter_id=user_id,
        category=data["category"],
        description=data["description"],
        location=from_shape(Point(data["longitude"], data["latitude"]), srid=4326),
        address=data.get("address"),
        zone_id=data.get("zone_id"),
    )
    db.session.add(report)
    db.session.flush()

    # Award incentive points for a verified report
    reward = UserReward.query.filter_by(user_id=user_id).first()
    if reward:
        reward.total_points += REWARD_POINTS_PER_REPORT
        reward.lifetime_points += REWARD_POINTS_PER_REPORT
        db.session.add(RewardTransaction(
            user_id=user_id,
            action="report_verified",
            points=REWARD_POINTS_PER_REPORT,
            reference_id=report.id,
            description=f"Points earned for submitting report: {report.category}",
        ))

    db.session.commit()
    return jsonify(_enrich(report)), 201


@reports_bp.route("/<string:report_id>/status", methods=["PATCH"])
@jwt_required()
def update_report_status(report_id):
    """Admin / collector updates report status."""
    claims = get_jwt()
    if claims.get("role") not in ("admin", "collector"):
        return jsonify({"error": "Insufficient permissions"}), 403

    report = Report.query.get_or_404(report_id)
    data = request.get_json()

    new_status = data.get("status")
    if new_status:
        report.status = new_status
    if new_status == "resolved":
        report.resolved_at = datetime.now(timezone.utc)
        report.resolution_note = data.get("resolution_note", "")

    # Optionally assign to a collector
    if data.get("assigned_to"):
        report.assigned_to = data["assigned_to"]

    db.session.commit()
    return jsonify(_enrich(report)), 200


@reports_bp.route("/<string:report_id>/images", methods=["POST"])
@jwt_required()
def add_report_image(report_id):
    """Attach an image URL to a report."""
    Report.query.get_or_404(report_id)
    data = request.get_json()
    image = ReportImage(
        report_id=report_id,
        image_url=data["image_url"],
        caption=data.get("caption"),
    )
    db.session.add(image)
    db.session.commit()
    return jsonify({"message": "Image attached", "id": image.id}), 201
