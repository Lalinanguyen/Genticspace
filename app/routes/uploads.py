import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.db.jwt_auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["uploads"])

# Sniffed from the browser-supplied Content-Type, not the filename -- an
# attacker-controlled filename extension is not a security boundary, but
# the actual multipart part's declared type at least keeps this to images
# without trying to parse/validate file bytes here.
_ALLOWED_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@router.post("/uploads")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    ext = _ALLOWED_CONTENT_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Only PNG, JPEG, WEBP or GIF images are accepted")

    # Read one byte past the limit so an over-size file is rejected instead
    # of silently truncated.
    data = await file.read(settings.UPLOADS_MAX_BYTES + 1)
    if len(data) > settings.UPLOADS_MAX_BYTES:
        raise HTTPException(400, f"Image must be under {settings.UPLOADS_MAX_BYTES // 1_000_000}MB")
    if not data:
        raise HTTPException(400, "Empty file")

    os.makedirs(settings.UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(settings.UPLOADS_DIR, filename), "wb") as f:
        f.write(data)

    logger.info("Image upload: %s (%d bytes) by user_id=%s", filename, len(data), current_user["id"])
    return {"url": f"{settings.UPLOADS_PUBLIC_BASE_URL}/uploads/{filename}"}
