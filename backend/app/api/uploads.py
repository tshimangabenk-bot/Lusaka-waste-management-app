"""
File upload API — stores images in Firebase Storage.

POST /api/uploads/report-image
  multipart/form-data: file=<image>, report_id=<uuid>
  Returns: { url, image_id }
"""
import uuid as _uuid

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db, firebase
from app.models import Report, ReportImage

uploads_bp = Blueprint("uploads", __name__)

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@uploads_bp.route("/report-image", methods=["POST"])
@jwt_required()
def upload_report_image():
    """Upload an image file for a report; store it in Firebase Storage."""
    if not firebase.is_enabled():
        return jsonify({"error": "Firebase Storage is not configured on this server"}), 503

    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    file      = request.files["file"]
    report_id = request.form.get("report_id")

    if not report_id:
        return jsonify({"error": "report_id is required"}), 400

    report = Report.query.get_or_404(report_id)

    # Ownership check — residents can only attach images to their own reports
    user_id = get_jwt_identity()
    if report.reporter_id != user_id:
        return jsonify({"error": "Forbidden"}), 403

    if file.content_type not in ALLOWED_MIME:
        return jsonify({"error": f"Unsupported file type: {file.content_type}"}), 415

    ext  = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    path = f"reports/{report_id}/{_uuid.uuid4()}.{ext}"

    try:
        url = firebase.upload_file(file.read(), path, file.content_type)
    except Exception as exc:
        return jsonify({"error": "Upload failed", "detail": str(exc)}), 500

    image = ReportImage(report_id=report_id, image_url=url,
                        caption=request.form.get("caption"))
    db.session.add(image)
    db.session.commit()

    return jsonify({"url": url, "image_id": image.id}), 201
