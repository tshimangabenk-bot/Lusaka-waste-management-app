"""
api/auth.py — Authentication API Blueprint.

Provides JWT-based authentication for all user roles (resident, collector, admin).
Also supports Firebase Identity Platform sign-in (Google, phone, email/password)
via token exchange at /api/auth/firebase-login.

Endpoints
---------
POST /api/auth/register         — create a new account (any role)
POST /api/auth/login            — email + password → JWT pair
POST /api/auth/refresh          — rotate the access token using a refresh token
GET  /api/auth/me               — return the current user's profile
POST /api/auth/firebase-login   — exchange a Firebase ID token for app JWTs

Token strategy
--------------
- Access token  : short-lived (default 1 h, set via JWT_ACCESS_TOKEN_EXPIRES).
                  Sent in the Authorization: Bearer <token> header on every request.
- Refresh token : long-lived (default 30 days, JWT_REFRESH_TOKEN_EXPIRES).
                  Used only at /auth/refresh to obtain a new access token.

Role claim
----------
The user's role ("resident", "collector", "admin") is embedded as an additional
claim in the access token.  API endpoints read it via get_jwt()["role"] to
perform role-based access control without an extra DB query.
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
from marshmallow import ValidationError

from app import db
from app.models import User, UserReward
from app.schemas import UserSchema, UserCreateSchema, LoginSchema
from app import firebase

auth_bp = Blueprint("auth", __name__)

# Schema instances reused across endpoints (avoids repeated instantiation)
user_schema        = UserSchema()
user_create_schema = UserCreateSchema()
login_schema       = LoginSchema()


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user and return JWT tokens.

    Request body (JSON):
        email, password, first_name, last_name  — required
        phone, role, compound, latitude, longitude — optional

    On success (201):
        Returns the new user object plus access_token and refresh_token.

    Errors:
        422 — validation failure (missing required fields, bad types)
        409 — email already exists
    """
    # Validate and deserialise the request body using marshmallow
    try:
        data = user_create_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": "Validation failed", "details": err.messages}), 422

    # Prevent duplicate accounts
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(
        email=data["email"],
        phone=data.get("phone"),
        # Plaintext password is never stored — bcrypt hash only
        password_hash=generate_password_hash(data["password"]),
        first_name=data["first_name"],
        last_name=data["last_name"],
        role=data.get("role", "resident"),   # default role is resident
        compound=data.get("compound"),
    )

    # Store home GPS pin if provided (used for nearest-bin lookup)
    if data.get("latitude") and data.get("longitude"):
        user.latitude  = data["latitude"]
        user.longitude = data["longitude"]

    db.session.add(user)
    # flush() assigns the auto-generated UUID before we reference user.id below
    db.session.flush()

    # Every resident gets a reward balance record starting at 0 points
    if user.role == "resident":
        db.session.add(UserReward(user_id=user.id, total_points=0, lifetime_points=0))

    db.session.commit()

    # Issue JWT pair — role is embedded as a custom claim for RBAC
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
    """
    Authenticate with email + password and return JWT tokens.

    Request body: { "email": "...", "password": "..." }

    Errors:
        401 — wrong email or password
        403 — account is deactivated
    """
    try:
        data = login_schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": "Validation failed", "details": err.messages}), 422

    user = User.query.filter_by(email=data["email"]).first()

    # Use a single vague error message for both "user not found" and "wrong password"
    # to prevent user enumeration attacks
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
@jwt_required(refresh=True)   # requires the long-lived refresh token, not the access token
def refresh():
    """
    Issue a new access token using a valid refresh token.

    The client sends the refresh token in the Authorization header.
    Only a new access token is returned — the refresh token is NOT rotated here.

    Note: For production, consider rotating the refresh token on each call
    (issue a new one and invalidate the old one) to limit the blast radius
    of a stolen refresh token.
    """
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)
    # Re-embed the current role in case it was changed since the last login
    access_token = create_access_token(identity=user_id, additional_claims={"role": user.role})
    return jsonify({"access_token": access_token}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """
    Return the current authenticated user's profile.

    Used by the frontend on app load to restore session state.
    The password_hash field is excluded by UserSchema.
    """
    user = User.query.get_or_404(get_jwt_identity())
    return jsonify(user_schema.dump(user)), 200


@auth_bp.route("/firebase-login", methods=["POST"])
def firebase_login():
    """
    Exchange a Firebase ID token for application JWT tokens.

    Frontend flow:
      1. User signs in via the Firebase JS/mobile SDK
         (Google, Apple, phone OTP, or Firebase email/password).
      2. Frontend calls  firebaseUser.getIdToken()  to get a short-lived ID token.
      3. Frontend POSTs that token here.
      4. Backend verifies the token with Firebase Admin SDK (cryptographic check —
         no network roundtrip needed after public keys are cached).
      5. Backend finds or auto-creates the local User row.
      6. Backend returns the same JWT pair used by all other endpoints.

    Auto-provisioning
    -----------------
    If no User exists for the Firebase email, a new account is created with:
      - first_name / last_name derived from the Firebase display name
      - is_verified = True (Firebase has already verified the identity)
      - password_hash set to the hashed Firebase UID (not a usable password)

    Errors:
        503 — Firebase not configured on this server
        400 — id_token missing from request body
        401 — invalid or expired Firebase token
    """
    if not firebase.is_enabled():
        return jsonify({"error": "Firebase is not configured on this server"}), 503

    body     = request.get_json(silent=True) or {}
    id_token = body.get("id_token")
    if not id_token:
        return jsonify({"error": "id_token is required"}), 400

    # Verify the token using Firebase Admin SDK — raises an exception if invalid
    try:
        decoded = firebase.verify_id_token(id_token)
    except Exception as exc:
        return jsonify({"error": "Invalid Firebase token", "detail": str(exc)}), 401

    email   = decoded.get("email", "")
    name    = decoded.get("name", "") or ""
    picture = decoded.get("picture")   # profile photo URL from Google

    # Find existing user or auto-create one from the Firebase profile claims
    user = User.query.filter_by(email=email).first() if email else None
    if not user:
        # Split the display name into first/last; fall back to email username
        parts      = name.split(" ", 1)
        first_name = parts[0] if parts else (email.split("@")[0] if email else "User")
        last_name  = parts[1] if len(parts) > 1 else ""
        user = User(
            email=email,
            # Use the Firebase UID as a non-guessable password placeholder —
            # this user will always sign in via Firebase, never email+password
            password_hash=generate_password_hash(decoded["uid"]),
            first_name=first_name,
            last_name=last_name,
            profile_image=picture,
            is_verified=True,   # Firebase has already validated their identity
        )
        db.session.add(user)
        db.session.flush()
        # Provision a reward balance for the new resident
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
