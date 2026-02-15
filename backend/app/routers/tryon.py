"""
Try-On router — handles virtual try-on image generation.
"""
import logging

from fastapi import APIRouter, File, UploadFile, HTTPException, Request

from app.models.schemas import TryOnResponse
from app.services.tryon_service import process_tryon
from app.utils.image_utils import save_upload_to_temp, save_base64_to_storage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Try-On"])


@router.post(
    "/try_on",
    response_model=TryOnResponse,
    summary="Generate a virtual try-on image",
    description="Upload a person image and a garment image. Returns a composite image of the person wearing the garment.",
)
async def try_on(
    person_image: UploadFile = File(..., description="Photo of the person"),
    garment_image: UploadFile = File(..., description="Photo of the clothing item"),
    request: Request = None,  # To reconstruct absolute URL if needed (optional)
) -> TryOnResponse:
    """Process a virtual try-on request."""
    logger.info(f"Try-on request: person={person_image.filename}, garment={garment_image.filename}")

    try:
        # Save uploads to temp directory
        person_path = await save_upload_to_temp(person_image, prefix="person")
        clothing_path = await save_upload_to_temp(garment_image, prefix="garment")

        # Process try-on (mock or real) -> Returns base64 string
        result_data_uri = await process_tryon(person_path, clothing_path)

        # Decode base64 and save to persistent storage
        image_url_path = save_base64_to_storage(result_data_uri)

        # Construct full URL if needed, or just return path (frontend can prepend base URL)
        # For now, let's return the relative path from the server root, which is what we stored.
        # But to be helpful, let's make it a full URL if we can, or at least absolute path.
        # storage path logic returns "/images/..."
        
        # If we want absolute URL:
        # base_url = str(request.base_url).rstrip("/")
        # full_url = f"{base_url}{image_url_path}"
        
        # But the requirement said "exposes a public URL". 
        # Since we mounted /images, the relative path "/images/..." is valid for the current domain.
        # Let's return just the path for simplicity, or full URL to be robust. 
        # "http://server/images/<filename>.webp" was the example.
        if request:
            full_url = str(request.base_url).rstrip("/") + image_url_path
        else:
            full_url = image_url_path

        logger.info(f"Try-on completed successfully. Saved to: {image_url_path}")
        return TryOnResponse(status="success", image_url=full_url)

    except Exception as e:
        logger.error(f"Try-on failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
