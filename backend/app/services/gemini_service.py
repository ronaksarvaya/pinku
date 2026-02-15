"""
Google Gemini AI service — provides recommendations and style tips.
"""
import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

# Module-level model cache
_model = None


def _get_model():
    """Lazy-initialize the Gemini model."""
    global _model
    if _model is not None:
        return _model

    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — AI features will use fallback mode")
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        _model = genai.GenerativeModel("gemini-2.0-flash")
        logger.info("Gemini model initialized successfully")
        return _model
    except Exception as e:
        logger.error(f"Failed to initialize Gemini model: {e}")
        return None


async def get_recommendation(
    clothing_type: Optional[str] = None,
    occasion: Optional[str] = None,
    preferences: Optional[str] = None,
    colors: Optional[list[str]] = None,
) -> tuple[str, str]:
    """
    Get an AI-powered style recommendation.

    Returns:
        Tuple of (suggestion_text, source) where source is "gemini" or "fallback".
    """
    model = _get_model()

    if model is None:
        return _fallback_recommendation(clothing_type, occasion), "fallback"

    try:
        prompt = _build_recommendation_prompt(clothing_type, occasion, preferences, colors)
        response = model.generate_content(prompt)
        suggestion = response.text.strip()
        logger.info("Gemini recommendation generated successfully")
        return suggestion, "gemini"
    except Exception as e:
        logger.error(f"Gemini recommendation failed: {e}")
        return _fallback_recommendation(clothing_type, occasion), "fallback"


async def get_combo_tip(style: str) -> Optional[str]:
    """
    Get an AI-generated styling tip for a combo style.

    Returns:
        AI tip string, or None if Gemini is unavailable.
    """
    model = _get_model()
    if model is None:
        return None

    try:
        prompt = (
            f"You are a men's fashion stylist. Give ONE short, practical styling tip "
            f"(2-3 sentences max) for a '{style}' outfit combo. Be specific about "
            f"colors, fit, and accessories. Keep it conversational and actionable."
        )
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini combo tip failed: {e}")
        return None


def _build_recommendation_prompt(
    clothing_type: Optional[str],
    occasion: Optional[str],
    preferences: Optional[str],
    colors: Optional[list[str]],
) -> str:
    """Build a structured prompt for Gemini recommendation."""
    parts = [
        "You are an expert men's fashion stylist. Based on the following details, "
        "provide a concise style recommendation (3-4 sentences). "
        "Suggest specific accessories, shoes, and complementary clothing items. "
        "Be practical and specific about colors and styles."
    ]

    if clothing_type:
        parts.append(f"\nClothing type: {clothing_type}")
    if occasion:
        parts.append(f"Occasion: {occasion}")
    if preferences:
        parts.append(f"Style preferences: {preferences}")
    if colors:
        parts.append(f"Current colors being worn: {', '.join(colors)}")

    if not any([clothing_type, occasion, preferences, colors]):
        parts.append(
            "\nNo specific details provided. Give a general versatile outfit suggestion "
            "that works for most casual occasions."
        )

    return "\n".join(parts)


def _fallback_recommendation(
    clothing_type: Optional[str] = None,
    occasion: Optional[str] = None,
) -> str:
    """Fallback recommendations when Gemini is unavailable."""
    suggestions = {
        "formal": "Pair with a slim-fit navy blazer, brown Oxford shoes, and a leather strap watch for a polished look.",
        "casual": "Try white sneakers, a minimal leather belt, and silver-tone accessories for a relaxed yet put-together style.",
        "party": "Go bold with black Chelsea boots, a statement chain necklace, and a fitted dark jacket.",
    }

    if occasion and occasion.lower() in suggestions:
        return f"AI Suggests: {suggestions[occasion.lower()]}"

    if clothing_type:
        return f"AI Suggests: Complement your {clothing_type} with neutral accessories — a leather watch, clean sneakers, and a slim belt work well."

    return "AI Suggests: White sneakers, a brown leather watch, and a minimal chain create a versatile look for any occasion."
