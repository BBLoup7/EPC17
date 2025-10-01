
# EPC17 - Prompting Playbook (PromptSpec.md)

## Purpose
This document defines how to design, version, test, and store prompts for EPC17 features that use LLMs (race recaps, voice lines, summaries). Prompts are treated as code assets: versioned, tested, and auditable.

## Prompt Versioning & Storage
- Store prompts in `/llm/prompts/<feature>/<version>/PromptSpec.md`
- Each PromptSpec includes:
  - Goal
  - Return format (strict schema)
  - Context definition (what inputs to supply)
  - Warnings & guardrails
  - Example input(s) and gold output(s)
  - Evaluation rubric
  - Engine settings (temperature, max_tokens, etc.)
  - Changelog

## PromptSpec Template
```
# PromptSpec: <feature>-v<major>

Goal:
  One-sentence description of objective.

ReturnFormat:
  JSON schema or explicit Markdown layout.

Context:
  List all fields required in the context object. Example:
    { eventMeta, classResults[], laneUsageStats, incidents[] }

Warnings:
  - Do not invent driver names or positions.
  - If required data missing, return needs_data: true.

ExampleInput:
  { ... }  // real small sample

GoldOutput:
  { ... }  // desired output for the example input

EngineSettings:
  temperature: 0.2
  top_p: 0.95
  max_tokens: 400

Evaluation:
  - Exactness: 0-10
  - Grounding: 0-10
  - Format adherence: 0-5
  - Tone/style: 0-5
  - Safety: 0-5

ScoreThreshold: 25
```

## Recommended Prompting Patterns
1. **System+Role**: Use a clear system prompt to lock the role and output behavior.
   - Example: "You are EPC17's race editor. Output must match the ReturnFormat exactly."
2. **Strict Return Format**: Prefer JSON objects for machine consumption.
3. **Few-shot**: Include 1 or 2 gold examples to enforce style/format.
4. **Step-back / Decompose**:
   - Ask LLM to produce a short ‘‘analysis’’ block (e.g., top 3 stats) and then produce the final prose/JSON.
   - Use analysis only for internal validation; do not expose to end users unless flagged for debugging.
5. **Low Temperature for Facts**: ≤ 0.3 for recap/record tasks.

## Race Recap - PromptSpec (example)
```
# PromptSpec: race-recap-v1

Goal:
  Produce a concise race recap for a class with highlights and stats.

ReturnFormat:
  JSON:
  {
    "class": string,
    "headline": string,
    "highlights": [string],
    "topTimes": [{"driverId": uuid, "driverName": string, "time": number}],
    "laneBias": {"laneId": string, "bias": number},
    "anomalies": [string],
    "needs_data": boolean
  }

Context:
  {
    "eventMeta": { "eventId": uuid, "trackId": uuid, "date": ISOString },
    "classResults": [{ "position": int, "driverId": uuid, "driverName": string, "time": number, "laneId": string }],
    "laneUsage": [{ "laneId": string, "usageCount": int }],
    "incidents": [{ "type": string, "desc": string, "drivers": [uuid] }]
  }

Warnings:
  - Do not invent missing times or drivers.
  - If driver name not present, return needs_data: true and list missing fields.
  - Return valid JSON only.

ExampleInput:
  (attach small concrete JSON here in the repo)

GoldOutput:
  (attach gold JSON output for the example input)

EngineSettings:
  temperature: 0.2
  max_tokens: 300

Evaluation:
  - Grounding: must reference only fields from Context
  - Format compliance: strict JSON validator
```

## Hallucination Guardrails
- If any required contextual field is missing, the model must set `needs_data: true` and include `missing_fields: [...]`.
- Do not allow free-form speculation on driver motivations, sponsorships, or legal matters.
- Strip Personally Identifiable Information before sending to third-party APIs.

## Prompt Testing
- Unit-test prompts by executing them against stored examples and verifying:
  - exact JSON schema match
  - critical fields match expected values
- Run 3 runs with the same prompt at target temperature to verify consistency
- Attach the best-run output as the canonical example in `examples/`

## Logging & Traceability
- For every LLM call, log:
  - prompt version (path and commit hash)
  - input context (redact PII)
  - response
  - engine settings
  - timestamp
- Keep logs searchable for audits and debugging

## Operational Notes
- Use local mock LLM or small deterministic model for dev tests
- Gate access to production LLM keys; store in secrets manager
- For voice generation (if used later), maintain separate PromptSpec tied to voice persona and audio safety checks

## Example Minimal Prompt (system + user)
System:
"You are EPC17's race editor. Only return JSON matching the requested schema. If required data is missing, set needs_data: true."

User:
"Generate a race recap using the following context: <JSON>"

