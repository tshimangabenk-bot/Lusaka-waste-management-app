"""
firebase.py — Firebase Admin SDK wrapper module.

Single initialisation point for all Firebase services used by the backend:

  Auth     — verify Firebase ID tokens (Google Sign-In, phone auth, email/password).
             Allows the /auth/firebase-login endpoint to accept Firebase credentials
             and exchange them for app-level JWT tokens.

  Storage  — upload resident-submitted report photos to Firebase Storage.
             Returns a public URL stored in ReportImage.image_url.

  FCM      — Firebase Cloud Messaging for push notifications to resident devices.
             Device tokens (User.fcm_token) are registered when the mobile app
             calls /api/users/<id> to save the token after app launch.

Configuration
-------------
Production (Railway / Render):
    Set the FIREBASE_CREDENTIALS_JSON environment variable to the full contents
    of your Firebase service account JSON file (paste the entire JSON as one value).

Local development:
    Set FIREBASE_CREDENTIALS_PATH in your .env file to the path of the
    serviceAccountKey.json file downloaded from Firebase Console.

If neither is configured, Firebase is silently disabled.  The API continues to
work — only Firebase-dependent features (firebase-login, push notifications,
Storage uploads) will return 503 or skip silently.
"""
import json
import logging
import os

logger = logging.getLogger(__name__)

# Module-level flag — True once firebase_admin.initialize_app() has succeeded.
# Guards against double-initialisation (e.g. when create_app() is called in tests).
_initialized = False


# ── Initialisation ─────────────────────────────────────────────────────────────

def init_firebase(app) -> None:
    """
    Initialise the Firebase Admin SDK using credentials from app config or env vars.

    Called once by create_app() after Flask configuration is loaded.
    Safe to call multiple times — subsequent calls are no-ops.

    Credential lookup order:
      1. FIREBASE_CREDENTIALS_JSON environment variable (inline JSON string)
         — preferred for cloud deployments (no file system access needed)
      2. FIREBASE_CREDENTIALS_PATH config key pointing to a local JSON file
         — used for local development

    If neither is found, Firebase is disabled and a warning is logged.
    """
    global _initialized
    if _initialized:
        return  # Already set up — skip re-initialisation

    import firebase_admin
    from firebase_admin import credentials

    bucket = app.config.get("FIREBASE_STORAGE_BUCKET", "")
    cred   = None

    # Option 1: inline JSON via environment variable (cloud deployments)
    cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
    if cred_json:
        try:
            cred = credentials.Certificate(json.loads(cred_json))
        except Exception as e:
            app.logger.warning("FIREBASE_CREDENTIALS_JSON is invalid: %s", e)

    # Option 2: path to local JSON file (local dev)
    if cred is None:
        cred_path = app.config.get("FIREBASE_CREDENTIALS_PATH", "")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)

    if cred is None:
        app.logger.warning(
            "Firebase disabled — set FIREBASE_CREDENTIALS_JSON (production) "
            "or FIREBASE_CREDENTIALS_PATH (local dev) to enable Auth, Storage, and FCM."
        )
        return  # Exit without initialising — all public functions check _initialized

    firebase_admin.initialize_app(cred, {"storageBucket": bucket})
    _initialized = True
    app.logger.info("Firebase Admin SDK initialised (bucket=%s).", bucket)


def is_enabled() -> bool:
    """Return True if the Firebase Admin SDK has been successfully initialised."""
    return _initialized


# ── Auth ───────────────────────────────────────────────────────────────────────

def verify_id_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return its decoded claims.

    The token is cryptographically verified against Firebase's public keys
    (cached locally after the first call).  No network roundtrip is needed
    after the keys are cached.

    Parameters
    ----------
    id_token : str — the Firebase ID token from the client SDK

    Returns
    -------
    dict — decoded JWT claims including uid, email, name, picture, etc.

    Raises
    ------
    RuntimeError — if Firebase is not initialised
    firebase_admin.auth.InvalidIdTokenError — if the token is invalid or expired
    """
    _require_init()
    from firebase_admin import auth
    return auth.verify_id_token(id_token)


# ── Storage ────────────────────────────────────────────────────────────────────

def upload_file(file_bytes: bytes, destination_path: str,
                content_type: str = "image/jpeg") -> str:
    """
    Upload a file to Firebase Storage and return its public URL.

    Used by the /api/uploads endpoint to store report images.

    Parameters
    ----------
    file_bytes       : bytes — raw file content
    destination_path : str   — path within the Storage bucket
                               e.g. "reports/<report_id>/photo_1.jpg"
    content_type     : str   — MIME type (default: image/jpeg)

    Returns
    -------
    str — public HTTPS URL of the uploaded file
    """
    _require_init()
    from firebase_admin import storage
    blob = storage.bucket().blob(destination_path)
    blob.upload_from_string(file_bytes, content_type=content_type)
    blob.make_public()   # Makes the object publicly readable (no auth required for viewing)
    return blob.public_url


# ── FCM (Firebase Cloud Messaging) ────────────────────────────────────────────

def send_push(token: str, title: str, body: str, data: dict = None) -> str:
    """
    Send a push notification to a single device token.

    Used for targeted notifications (e.g. "Your report has been resolved").

    Parameters
    ----------
    token : str  — the FCM device token stored in User.fcm_token
    title : str  — notification title (shown in the notification shade)
    body  : str  — notification body text
    data  : dict — optional key-value payload for the app to process silently

    Returns
    -------
    str — the FCM message ID (can be used for delivery receipts), or '' if disabled
    """
    if not _initialized:
        # Log at DEBUG not WARNING — this is expected in dev/test environments
        logger.debug("Firebase disabled — skipping FCM push to %s.", token[:10])
        return ""
    from firebase_admin import messaging
    # All data values must be strings per FCM spec
    msg = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        token=token,
    )
    return messaging.send(msg)


def send_multicast(tokens: list[str], title: str, body: str,
                   data: dict = None) -> None:
    """
    Send a push notification to multiple device tokens in one API call.

    Used for broadcast notifications (e.g. "Collection day tomorrow in Zone 3").
    More efficient than multiple send_push() calls — Firebase handles fan-out.

    Parameters
    ----------
    tokens : list[str] — list of FCM device tokens (max 500 per FCM spec)
    title  : str       — notification title
    body   : str       — notification body
    data   : dict      — optional silent data payload
    """
    if not _initialized or not tokens:
        return  # Silently skip — don't raise in background tasks
    from firebase_admin import messaging
    msg = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        tokens=tokens,
    )
    # send_each_for_multicast gives per-token success/failure results
    # (unlike deprecated send_multicast which returns an aggregate only)
    messaging.send_each_for_multicast(msg)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _require_init() -> None:
    """
    Raise RuntimeError if Firebase has not been initialised.

    Called by all public functions that need the SDK.  Provides a clear error
    message instead of an AttributeError deep in the firebase_admin library.
    """
    if not _initialized:
        raise RuntimeError(
            "Firebase is not initialised. "
            "Set FIREBASE_CREDENTIALS_PATH in your .env file."
        )
