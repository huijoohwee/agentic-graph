# AgenticGraph: Natural-Language “Commands” for GrabMaps Places (TCO + FOSS + MVP)

## 1) Problem statement
GrabMaps’ Places APIs support **keyword search** and **nearby search** (lat/lng + radius), but they do **not** natively support “natural-language commands” like:

> “list all the restaurants 5 km around City Hall”

This document recommends a **FOSS-first** way to implement such commands, including a **TCO-oriented TOPSIS evaluation** and an MVP reference design.

---

## 2) Target capability (what “natural-language commands” means here)
Convert user text into a **validated structured query plan** (JSON), then execute it via:

1) **Geocode** the center (“City Hall”) → GrabMaps keyword search  
2) **Nearby search** around that point (radius 5 km) → GrabMaps nearby  
3) **Filter & post-process** (e.g., only restaurants, distance checks, ranking, pagination)

---

## 3) Recommendation summary (MECE)
### Primary recommendation (FOSS-first)
- **Service form**: Python **FastAPI** “Command → Plan → Execute” microservice
- **NL parser**: Hybrid parser **(rules-first + LLM semantic parse fallback)**
- **LLM**: Self-hosted **Apache-2.0 open-weight** model (e.g., Mistral/Qwen class) for parsing + optional managed fallback
- **Output contract**: strict **Pydantic JSON schema** + constrained decoding where possible

### Why this wins on TCO
- Lowest long-run vendor lock-in risk while keeping iteration speed high.
- Keeps “LLM spend” bounded by using the LLM only for parsing/normalization, not for retrieval.
- Gradual hardening path: start flexible (LLM), then lock down to deterministic patterns for most traffic.

---

## 4) TOPSIS evaluation (TCO-first decision making)

### 4.1 TOPSIS method (quick)
We score options using criteria, normalize, apply weights, compute distance to:
- **Ideal best** (benefit criteria max, cost criteria min)
- **Ideal worst** (benefit criteria min, cost criteria max)

Closeness coefficient:
`C* = D_worst / (D_best + D_worst)` → higher is better.

> Note: Scores are *engineering estimates* intended to guide the decision; adjust weights to reflect your org constraints.

---

## 4.2 Decision A — Deliverable type
Options:
- **A1** Reference API service (FastAPI) (Command-in → JSON plan + results out)
- **A2** Library/module only (embed into an existing backend)
- **A3** Architecture + TCO write-up only (no code)

Criteria (1–5; higher is better unless marked “cost”):
- **Time-to-MVP** (benefit) — weight 0.25
- **Operational simplicity** (benefit) — weight 0.20
- **Reuse across products** (benefit) — weight 0.20
- **Integration flexibility** (benefit) — weight 0.15
- **Long-run maintenance cost** (cost) — weight 0.20

Decision matrix (example scores):

| Option | Time | Ops | Reuse | Flex | Maint (cost) |
|---|---:|---:|---:|---:|---:|
| A1 Service | 4 | 3 | 5 | 4 | 3 |
| A2 Library | 3 | 4 | 4 | 5 | 2 |
| A3 Doc only | 5 | 5 | 1 | 2 | 5 |

**TOPSIS result (rank):**
1) **A1 Service** (best overall for a shippable MVP + shared reuse)  
2) A2 Library  
3) A3 Doc only

**Recommendation:** build **A1** and keep the core parser/executor as importable modules (so you effectively get A2 “for free”).

---

## 4.3 Decision B — Stack for the MVP
Options:
- **B1** Python + FastAPI
- **B2** Node.js + Express

Criteria (weights):
- **Time-to-MVP** 0.35 (benefit)
- **Schema validation ergonomics** 0.25 (benefit)
- **Team familiarity** 0.15 (benefit)
- **Performance at low/med QPS** 0.10 (benefit)
- **Maintenance cost** 0.15 (cost)

Scores (example):

| Option | Time | Schema | Familiarity | Perf | Maint (cost) |
|---|---:|---:|---:|---:|---:|
| B1 FastAPI | 5 | 5 | 4 | 4 | 2 |
| B2 Express | 4 | 4 | 4 | 4 | 2 |

**TOPSIS result (rank):** **B1 FastAPI**

---

## 4.4 Decision C — LLM approach (TCO + FOSS)
Options:
- **C1** FOSS self-hosted only
- **C2** Managed LLM API only
- **C3** Hybrid (FOSS primary + managed fallback for hard queries)

Criteria (weights):
- **Vendor lock-in risk** 0.30 (benefit when low lock-in)
- **5-year cost predictability** 0.25 (benefit)
- **Ops burden** 0.20 (cost)
- **Quality ceiling** 0.15 (benefit)
- **Time-to-iterate** 0.10 (benefit)

Scores (example; higher=better except Ops burden is “cost”):

| Option | Lock-in | Cost predictability | Ops (cost) | Quality | Iterate |
|---|---:|---:|---:|---:|---:|
| C1 FOSS | 5 | 4 | 4 | 4 | 3 |
| C2 Managed | 1 | 2 | 1 | 5 | 5 |
| C3 Hybrid | 4 | 4 | 3 | 5 | 4 |

**TOPSIS result (rank):**
1) **C3 Hybrid** (best TCO-risk/quality balance)  
2) C1 FOSS-only  
3) C2 Managed-only

**Recommendation:** adopt **C3** but keep it **policy-controlled**:
- Default: FOSS model parses to JSON (most requests)
- Fallback: managed LLM only when confidence/validation fails *and* policy allows

If you need strict “FOSS-only”, use **C1** and compensate with stronger deterministic parsing + more examples + eval-driven iteration.

---

## 5) Reference architecture (Command → Plan → Execute)

### 5.1 Data flow
1) **Input**: user command string
2) **Parse**: produce a validated `CommandPlan`
3) **Plan**: expand into concrete API calls (geocode → nearby)
4) **Execute**: call GrabMaps endpoints
5) **Post-process**:
   - distance filter (Haversine)
   - type/category filtering (restaurant-only)
   - dedupe, ranking, limit, pagination
6) **Output**: results + provenance (what calls were made)

### 5.2 JSON contract (single source of truth)
Example `CommandPlan`:
```json
{
  "intent": "find_nearby",
  "category": "restaurant",
  "center": { "type": "place_name", "value": "City Hall" },
  "radius_km": 5,
  "rank_by": "distance",
  "limit": 50,
  "country": "SGP"
}
```

### 5.3 Parsing strategy (robust + cheap)
Use a **two-stage** parser:

**Stage 1: deterministic extraction (cheap, reliable)**
- regex/heuristics for:
  - radius (“5 km”, “500m”)
  - category (“restaurants”, “cafes”, “hotels”)
  - around/near (“around X”, “near X”)
  - limit (“top 10”, “show 50”)

**Stage 2: LLM semantic parse (fallback)**
- ask model to output **only JSON** matching the schema
- validate with Pydantic; on failure:
  - auto-repair (minor) or
  - ask clarifying question (“Which City Hall?”)

Constrained decoding options (pick one):
- **vLLM + structured outputs / tooling** where supported
- `llama.cpp` grammar / JSON schema constraint
- “generate JSON then validate + retry” (MVP baseline)

---

## 6) GrabMaps execution plan for the example command
Command:
> “list all the restaurants 5 km around City Hall”

Steps:
1) **Geocode** “City Hall” using keyword search  
   `GET /api/v1/maps/poi/v1/search?keyword=City%20Hall&country=SGP&limit=5`
2) Pick best candidate (or disambiguate) → `lat,lng`
3) **Nearby** search  
   `GET /api/v1/maps/place/v2/nearby?location=LAT,LNG&radius=5&rankBy=distance&limit=50`
4) **Restaurant filtering caveat**  
   The documented nearby endpoint does not show a category filter parameter; therefore:
   - filter by returned `business_type` / `categories` if present, else
   - run a **keyword search** biased by the center with `keyword=restaurant` and post-filter by distance

---

## 7) MVP reference service (FastAPI) — minimal skeleton
This is intentionally small; production needs auth, rate limiting, retries, caching, and logging.

```py
from typing import Literal, Optional
from fastapi import FastAPI
from pydantic import BaseModel, Field

class Center(BaseModel):
  type: Literal["place_name", "latlng"]
  value: str = Field(..., description="e.g. 'City Hall' or '1.2834,103.8607'")

class CommandPlan(BaseModel):
  intent: Literal["find_nearby"]
  category: Optional[str] = Field(default=None, description="e.g. restaurant")
  center: Center
  radius_km: float = Field(default=1, ge=0.1, le=50)
  rank_by: Literal["distance", "popularity"] = "distance"
  limit: int = Field(default=10, ge=1, le=50)
  country: Optional[str] = None

class CommandRequest(BaseModel):
  text: str
  country: Optional[str] = "SGP"

app = FastAPI()

@app.post("/command")
async def command(req: CommandRequest):
  plan = parse_to_plan(req.text, default_country=req.country)  # rules + LLM fallback
  results = await execute_plan(plan)
  return {"plan": plan.model_dump(), "results": results}
```

---

## 8) TCO notes (what drives cost in practice)
### 8.1 Managed LLM API (variable cost)
Main driver: **tokens per request** × **requests**.
Mitigation:
- restrict LLM usage to parsing only
- cache `(command_text → plan)` for repeated queries
- prefer rules for common patterns

### 8.2 Self-hosted LLM (fixed-ish cost)
Main drivers:
- GPU-hours (or CPU if low QPS / small model)
- ops time (patching, monitoring, autoscaling)
Mitigation:
- start with a small model for parsing (7B class) and quantify accuracy
- only upgrade model size if evals show material gains

---

## 9) FOSS shortlist (licenses matter)
Model/serving examples that are commonly used in FOSS-first deployments:
- **Mistral-7B-Instruct** (Apache-2.0)  
- **Qwen2.5-7B** (Apache-2.0)  
- **vLLM** serving engine (Apache-2.0)

> Always verify the specific model variant’s LICENSE file before production use.

---

## 10) Risks & mitigations
- **Ambiguous place names** (“City Hall” exists in many cities)  
  → disambiguation UX: show top candidates, request user confirmation
- **Category filtering gaps** in nearby API  
  → post-filter using returned categories + distance; or keyword search with location bias
- **LLM JSON errors**  
  → schema validation + retry with tighter instructions + constrained decoding if available
- **Prompt drift / regressions**  
  → golden test set + offline evals; version prompts like code

---

## 11) Next steps (practical)
1) Define the `CommandPlan` schema (SSOT) and a small golden dataset (20–50 commands).
2) Implement rules-first parser + LLM fallback parser.
3) Implement executor for the 3 core actions: geocode, nearby, distance filter.
4) Add caching and basic observability (request id, timing, validation failures).
5) Expand intents only after MVP is stable (e.g., “route to…”, “open now”, “price range” if supported).

---

## Sources
- Qwen2.5 license file (example): https://huggingface.co/Qwen/Qwen2.5-7B/blob/main/LICENSE  
- Mistral-7B-Instruct license (example): https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2  
- vLLM license: https://github.com/vllm-project/vllm/blob/main/LICENSE

