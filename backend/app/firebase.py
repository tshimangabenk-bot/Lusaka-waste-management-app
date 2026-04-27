"""
Firebase Admin SDK — single initialisation point.

Features enabled when FIREBASE_CREDENTIALS_PATH is set:
  - Auth   : verify Firebase ID tokens (Google Sign-In, phone auth, etc.)
  - Storage: upload report images to Firebase Storage
  - FCM    : send push notifications to resident devices
"""
import logging
import os

logger = logging.getLogger(__name__)

_initialized = False


# ── Initialisation ─────────────────────────────────────────────────────────

def init_firebase(app) -> None:
    global _initialized
    if _initialized:
        return

    cred_path = app.config.get("FIREBASE_CREDENTIALS_PATH", "")
    if not cred_path or not os.path.exists(cred_path):
        app.logger.warning(
            "Firebase disabled — set FIREBASE_CREDENTIALS_PATH to a valid "
            "service-account JSON file to enable Auth, Storage, and FCM."
        )
        return

    import firebase_admin
    from firebase_admin import credentials

    bucket = app.config.get("FIREBASE_STORAGE_BUCKET", "")
    firebase_admin.initialize_app(
        credentials.Certificate(cred_path),
        {"storageBucket": bucket},
    )
    _initialized = True
    app.logger.info("Firebase Admin SDK initialised (bucket=%s).", bucket)


def is_enabled() -> bool:
    return _initialized


# ── Auth ───────────────────────────────────────────────────────────────────

def verify_id_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims dict."""
    _require_init()
    from firebase_admin import auth
    return auth.verify_id_token(id_token)


# ── Storage ────────────────────────────────────────────────────────────────

def upload_file(file_bytes: bytes, destination_path: str,
                content_type: str = "image/jpeg") -> str:
    """Upload bytes to Firebase Storage and return a public URL."""
    _require_init()
    from firebase_admin import storage
    blob = storage.bucket().blob(destination_path)
    blob.upload_from_string(file_bytes, content_type=content_type)
    blob.make_public()
    return blob.public_url


# ── FCM ────────────────────────────────────────────────────────────────────

def send_push(token: str, title: str, body: str, data: dict = None) -> str:
    """Send a push notification to a single device token.
    Returns the FCM message ID, or '' if Firebase is disabled."""
    if not _initialized:
        logger.debug("Firebase disabled — skipping FCM push to %s.", token[:10])
        return ""
    from firebase_admin import messaging
    msg = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        token=token,
    )
    return messaging.send(msg)


def send_multicast(tokens: list[str], title: str, body: str,
                   data: dict = None) -> None:
    """Send a push notification to multiple device tokens."""
    if not _initialized or not tokens:
        return
    from firebase_admin import messaging
    msg = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        tokens=tokens,
    )
    messaging.send_each_for_multicast(msg)


# ── Internal ───────────────────────────────────────────────────────────────

def _require_init() -> None:
    if not _initialized:
        raise RuntimeError(
            "Firebase is not initialised. "
            "Set FIREBASE_CREDENTIALS_PATH in your .env file."
        )
