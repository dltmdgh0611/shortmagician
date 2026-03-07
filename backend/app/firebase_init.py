import logging
import os

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

db = None

try:
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project_id = os.getenv("FIREBASE_PROJECT_ID")

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
    logger.warning(f"Failed to initialize Firebase Admin SDK: {e}. Continuing without Firestore.")
