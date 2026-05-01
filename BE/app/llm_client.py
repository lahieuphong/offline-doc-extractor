import json
import os
import re
from typing import Any, Dict, List, Optional

import requests

from app.prompts import build_extraction_prompt


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")


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

    response = requests.post(
        OLLAMA_URL,
        json=payload,
        timeout=240,
    )

    response.raise_for_status()

    data = response.json()
    raw_output = data.get("response", "")

    if not raw_output:
        raise ValueError("Empty response from Ollama")

    return extract_json_from_text(raw_output)
