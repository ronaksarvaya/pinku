"""
Virtual Try-On service — handles AI try-on via IDM-VTON Gradio space or mock mode.
"""
import asyncio
import logging
import time
from pathlib import Path

from app.config import get_settings
from app.utils.image_utils import file_to_base64_data_uri

logger = logging.getLogger(__name__)


async def process_tryon(person_path: Path, clothing_path: Path) -> str:
    """
    Run the virtual try-on pipeline.

    Args:
        person_path: Path to the person image on disk.
        clothing_path: Path to the clothing image on disk.

    Returns:
        Base64 data URI of the result image.
    """
    settings = get_settings()

    if settings.USE_MOCK_AI:
        return await _mock_tryon(clothing_path)
    else:
        return await _real_tryon(person_path, clothing_path)


async def _mock_tryon(clothing_path: Path) -> str:
    """
    Mock try-on: simulate processing delay, return the clothing image as the result.
    Useful for local development without GPU.
    """
    logger.info("Running in MOCK MODE — returning clothing image as result")
    await asyncio.sleep(1)  # Simulate brief processing
    return file_to_base64_data_uri(clothing_path)


async def _real_tryon(person_path: Path, clothing_path: Path) -> str:
    """
    Real try-on: call the IDM-VTON Gradio space on HuggingFace.
    This runs synchronously in a thread pool to avoid blocking the event loop.
    """
    logger.info("Calling IDM-VTON Gradio space for real try-on...")

    TIMEOUT_SECONDS = 120  # HF spaces can be slow to wake up

    def _call_gradio():
        from gradio_client import Client, handle_file

        settings = get_settings()
        hf_token = settings.HF_TOKEN or None

        try:
            client = Client("yisol/IDM-VTON", token=hf_token) if hf_token else Client("yisol/IDM-VTON")
        except Exception as e:
            raise ConnectionError(
                f"Cannot connect to IDM-VTON space (it may be sleeping or your network is blocking it). "
                f"Try again in a minute, or set USE_MOCK_AI=True in .env for local testing. Error: {e}"
            )

        result = client.predict(
            dict={
                "background": handle_file(str(person_path)),
                "layers": [],
                "composite": None,
            },
            garm_img=handle_file(str(clothing_path)),
            garment_des="clothing",
            is_checked=True,
            is_checked_crop=False,
            denoise_steps=30,
            seed=42,
            api_name="/tryon",
        )
        # result is a tuple: (output_image_path, masked_image_path)
        return result[0]

    loop = asyncio.get_event_loop()
    try:
        output_path = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gradio),
            timeout=TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(
            f"IDM-VTON did not respond within {TIMEOUT_SECONDS}s. "
            "The HuggingFace space may be cold-starting — try again in a minute, "
            "or set USE_MOCK_AI=True in .env."
        )
    except ConnectionError:
        raise  # Re-raise our custom message
    except Exception as e:
        raise RuntimeError(
            f"IDM-VTON call failed: {e}. "
            "Set USE_MOCK_AI=True in .env to test without the remote model."
        )

    logger.info(f"IDM-VTON returned result at: {output_path}")
    return file_to_base64_data_uri(output_path)
