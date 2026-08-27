import re
from typing import Any, Dict

def extract_sentence_features(sentence: str) -> Dict[str, Any]:
    s = (sentence or "").strip()
    lowered = s.lower()
    temporal = ""
    for w in ["before", "after", "during", "then", "next", "previously", "later"]:
        if re.search(rf"\b{re.escape(w)}\b", lowered):
            temporal = w
            break
    modality = ""
    for w in ["may", "might", "can", "could", "should", "must", "will"]:
        if re.search(rf"\b{re.escape(w)}\b", lowered):
            modality = w
            break
    negation = False
    for w in ["not", "never", "no"]:
        if re.search(rf"\b{re.escape(w)}\b", lowered):
            negation = True
            break
    return {"temporalMarker": temporal, "modality": modality, "negation": bool(negation)}
