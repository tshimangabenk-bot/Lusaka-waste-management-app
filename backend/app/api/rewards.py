"""
Rewards / Incentive API — view balance, earn & redeem points.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import UserReward, RewardCatalog, RewardTransaction
from app.schemas import (
    UserRewardSchema,
    RewardCatalogSchema,
    RewardTransactionSchema,
)

rewards_bp = Blueprint("rewards", __name__)
reward_schema = UserRewardSchema()
catalog_schema = RewardCatalogSchema(many=True)
tx_schema = RewardTransactionSchema(many=True)


@rewards_bp.route("/balance", methods=["GET"])
@jwt_required()
def get_balance():
    """Get current user's reward-point balance."""
    user_id = get_jwt_identity()
    reward = UserReward.query.filter_by(user_id=user_id).first()
    if not reward:
        return jsonify({"total_points": 0, "lifetime_points": 0}), 200
    return jsonify(reward_schema.dump(reward)), 200


@rewards_bp.route("/history", methods=["GET"])
@jwt_required()
def transaction_history():
    """List reward transactions for the current user."""
    user_id = get_jwt_identity()
    txns = RewardTransaction.query.filter_by(user_id=user_id)\
        .order_by(RewardTransaction.created_at.desc()).all()
    return jsonify(tx_schema.dump(txns)), 200


@rewards_bp.route("/catalog", methods=["GET"])
@jwt_required()
def list_catalog():
    """List available reward items."""
    items = RewardCatalog.query.filter_by(is_active=True).all()
    return jsonify(catalog_schema.dump(items)), 200


@rewards_bp.route("/redeem", methods=["POST"])
@jwt_required()
def redeem():
    """Redeem points for a catalog item."""
    user_id = get_jwt_identity()
    data = request.get_json()
    item_id = data.get("item_id")

    item = RewardCatalog.query.get_or_404(item_id)
    reward = UserReward.query.filter_by(user_id=user_id).first()

    if not reward or reward.total_points < item.points_cost:
        return jsonify({"error": "Insufficient points"}), 400

    if item.stock is not None:
        if item.stock <= 0:
            return jsonify({"error": "Item out of stock"}), 400
        item.stock -= 1

    reward.total_points -= item.points_cost
    db.session.add(RewardTransaction(
        user_id=user_id,
        action="redemption",
        points=-item.points_cost,
        reference_id=str(item.id),
        description=f"Redeemed: {item.title}",
    ))

    db.session.commit()
    return jsonify({
        "message": f"Successfully redeemed '{item.title}'",
        "remaining_points": reward.total_points,
    }), 200
