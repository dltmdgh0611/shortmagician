import logging
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

db = None

try:
    project_id = os.getenv("FIREBASE_PROJECT_ID")

    if getattr(sys, "frozen", False):
        # ── Frozen (PyInstaller): use in-memory credentials ───────────────
        # No serviceAccountKey.json on disk — decrypt from embedded _secrets
        try:
            from app._secrets import get_credentials_dict

            creds_dict = get_credentials_dict()
            if creds_dict and project_id:
                creds = credentials.Certificate(creds_dict)
                firebase_admin.initialize_app(creds, {"projectId": project_id})
                db = firestore.client()
                logger.info("Firebase Admin SDK initialized (embedded credentials)")
            else:
                logger.warning(
                    "Embedded credentials or FIREBASE_PROJECT_ID not available."
                )
        except ImportError:
            logger.warning("_secrets module not found in frozen build.")
    else:
        # ── Development: use file path from env ───────────────────────────
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

        if creds_path and project_id:
            creds = credentials.Certificate(creds_path)
            firebase_admin.initialize_app(creds, {"projectId": project_id})
            db = firestore.client()
            logger.info("Firebase Admin SDK initialized successfully")
        else:
            logger.warning(
                "Firebase credentials not configured. "
                "Set GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID to enable Firestore."
            )
except Exception as e:
    logger.warning(
        f"Failed to initialize Firebase Admin SDK: {e}. Continuing without Firestore."
    )
