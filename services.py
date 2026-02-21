import json
import os

import requests


DEFAULT_AI_RESULT = {
    "clarity": 0,
    "feasibility": 0,
    "differentiation": 0,
    "market_logic": 0,
    "risk_flags": [],
    "explanation": "AI unavailable",
}


def clamp(value, min_value, max_value):
    return max(min_value, min(max_value, value))


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def rule_score_calc(startup):
    # A) Team size (0-15)
    team_size = _to_int(getattr(startup, "team_size", 0), 0)
    if team_size <= 1:
        team_score = 6
    elif team_size <= 3:
        team_score = 12
    else:
        team_score = 15

    # B) Investment realism (0-15)
    investment_needed = getattr(startup, "investment_needed", 0) or 0
    try:
        investment_needed = float(investment_needed)
    except (TypeError, ValueError):
        investment_needed = 0
    if investment_needed <= 0:
        investment_score = 0
    elif investment_needed <= 200_000:
        investment_score = 15
    elif investment_needed <= 500_000:
        investment_score = 10
    else:
        investment_score = 6

    # C) Industry specificity (0-10)
    industry = str(getattr(startup, "industry", "") or "").strip().lower()
    if not industry or industry in {"other", "general", "unknown"}:
        industry_score = 4
    else:
        industry_score = 10

    # D) Market input mapping (0-20)
    market_impact = _to_int(getattr(startup, "market_impact", 1), 1)
    market_score = clamp(market_impact, 1, 10) * 2

    total = team_score + investment_score + industry_score + market_score
    return clamp(total, 0, 60)


def _extract_json_object(raw_text):
    if not isinstance(raw_text, str):
        return None

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    candidate = cleaned[start : end + 1]
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        return None


def _sanitize_ai_result(parsed):
    if not isinstance(parsed, dict):
        return DEFAULT_AI_RESULT.copy()

    result = {
        "clarity": clamp(_to_int(parsed.get("clarity", 0), 0), 0, 10),
        "feasibility": clamp(_to_int(parsed.get("feasibility", 0), 0), 0, 10),
        "differentiation": clamp(_to_int(parsed.get("differentiation", 0), 0), 0, 10),
        "market_logic": clamp(_to_int(parsed.get("market_logic", 0), 0), 0, 10),
        "risk_flags": [],
        "explanation": "AI unavailable",
    }

    risk_flags = parsed.get("risk_flags", [])
    if isinstance(risk_flags, list):
        result["risk_flags"] = [str(item).strip() for item in risk_flags if str(item).strip()][:3]

    explanation = parsed.get("explanation")
    if isinstance(explanation, str) and explanation.strip():
        result["explanation"] = explanation.strip()

    return result


def call_gemini_score(idea, industry):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return DEFAULT_AI_RESULT.copy()

    prompt = (
        "You are scoring startup ideas. Return STRICT JSON only with keys: "
        "clarity, feasibility, differentiation, market_logic, risk_flags, explanation. "
        "Rules: clarity/feasibility/differentiation/market_logic must be integer 0..10. "
        "risk_flags must be JSON array of short strings, max 3 items. "
        "explanation must be 1-2 sentences. No markdown, no extra text.\n"
        f"Idea: {idea}\n"
        f"Industry: {industry}\n"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-1.5-flash:generateContent"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }

    try:
        response = requests.post(
            url,
            params={"key": api_key},
            json=payload,
            timeout=(3, 5),
        )
        response.raise_for_status()
        body = response.json()
        text = (
            body.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        parsed = _extract_json_object(text)
        return _sanitize_ai_result(parsed)
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
        return DEFAULT_AI_RESULT.copy()
