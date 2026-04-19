"""
Collection Routes API — planning & tracking waste-truck routes.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from datetime import datetime, timezone

from app import db
from app.models import CollectionRoute, RouteStop, SmartBin
from app.schemas import CollectionRouteSchema

routes_bp = Blueprint("routes", __name__)
route_schema = CollectionRouteSchema()
routes_schema = CollectionRouteSchema(many=True)


@routes_bp.route("", methods=["GET"])
@jwt_required()
def list_routes():
    """List collection routes, optionally by zone or date."""
    query = CollectionRoute.query

    zone_id = request.args.get("zone_id", type=int)
    date    = request.args.get("date")  # YYYY-MM-DD

    if zone_id:
        query = query.filter_by(zone_id=zone_id)
    if date:
        query = query.filter_by(scheduled_date=date)

    routes = query.order_by(CollectionRoute.scheduled_date.desc()).all()
    return jsonify(routes_schema.dump(routes)), 200


@routes_bp.route("/<string:route_id>", methods=["GET"])
@jwt_required()
def get_route(route_id):
    route = CollectionRoute.query.get_or_404(route_id)
    return jsonify(route_schema.dump(route)), 200


@routes_bp.route("", methods=["POST"])
@jwt_required()
def create_route():
    """Create a new collection route with ordered bin stops (admin only)."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    data = request.get_json()

    route = CollectionRoute(
        name=data["name"],
        zone_id=data.get("zone_id"),
        vehicle_id=data.get("vehicle_id"),
        driver_id=data.get("driver_id"),
        scheduled_date=data["scheduled_date"],
        notes=data.get("notes"),
    )
    db.session.add(route)
    db.session.flush()

    # Add ordered bin stops
    for idx, stop_data in enumerate(data.get("stops", []), start=1):
        stop = RouteStop(
            route_id=route.id,
            bin_id=stop_data["bin_id"],
            stop_order=idx,
        )
        db.session.add(stop)

    db.session.commit()
    return jsonify(route_schema.dump(route)), 201


@routes_bp.route("/<string:route_id>/start", methods=["POST"])
@jwt_required()
def start_route(route_id):
    """Mark route as in‑progress."""
    route = CollectionRoute.query.get_or_404(route_id)
    route.status = "in_progress"
    route.start_time = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(route_schema.dump(route)), 200


@routes_bp.route("/<string:route_id>/complete", methods=["POST"])
@jwt_required()
def complete_route(route_id):
    """Mark route as completed."""
    route = CollectionRoute.query.get_or_404(route_id)
    route.status = "completed"
    route.end_time = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(route_schema.dump(route)), 200


@routes_bp.route("/<string:route_id>/stops/<int:stop_id>/visit", methods=["POST"])
@jwt_required()
def visit_stop(route_id, stop_id):
    """Mark an individual stop as visited and record fill level."""
    stop = RouteStop.query.filter_by(id=stop_id, route_id=route_id).first_or_404()
    data = request.get_json() or {}

    stop.visited = True
    stop.visited_at = datetime.now(timezone.utc)
    stop.fill_at_visit = data.get("fill_percentage")

    # Optionally update the bin to 'empty'
    bin_obj = SmartBin.query.get(stop.bin_id)
    if bin_obj:
        bin_obj.status = "empty"
        bin_obj.fill_percentage = 0
        bin_obj.last_emptied_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({"message": "Stop visited", "stop_id": stop.id}), 200
