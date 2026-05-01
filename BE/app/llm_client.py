import json
import os
import re
from typing import Any, Dict, List, Optional

import requests

from app.prompts import build_extraction_prompt


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT_SEC = int(os.getenv("OLLAMA_TIMEOUT_SEC", "180"))
OLLAMA_MAX_RETRIES = max(0, int(os.getenv("OLLAMA_MAX_RETRIES", "1")))


def extract_json_from_text(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)

    if not match:
        raise ValueError("LLM response does not contain JSON")

    return json.loads(match.group(0))


def extract_with_ollama(
    document_text: str,
    fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    prompt = build_extraction_prompt(document_text, fields)

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
        },
    }

    last_error: Optional[Exception] = None
    for attempt in range(OLLAMA_MAX_RETRIES + 1):
        try:
            response = requests.post(
                OLLAMA_URL,
                json=payload,
                timeout=OLLAMA_TIMEOUT_SEC,
            )
            response.raise_for_status()

            data = response.json()
            raw_output = data.get("response", "")

            if not raw_output:
                raise ValueError("Empty response from Ollama")

            return extract_json_from_text(raw_output)
        except Exception as error:
            last_error = error
            if attempt >= OLLAMA_MAX_RETRIES:
                break

    raise ValueError(f"Ollama failed after retries: {last_error}")
