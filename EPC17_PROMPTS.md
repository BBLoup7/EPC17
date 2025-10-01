# EPC17 - Prompting Playbook (PromptSpec.md) - ENHANCED for Cursor

## Purpose
Define how to design, version, test, and store prompts for EPC17 features that use LLMs (race recaps, voice lines, summaries, code generation). Treat prompts as code assets: versioned, tested, auditable, and stored in-repo so Cursor can reference them directly.

## Prompt Versioning & Storage
- Store prompts in `/llm/prompts/<feature>/v<major>/PromptSpec.md`
- Each PromptSpec includes:
  - Goal
  - Return format (strict schema)
  - Context definition (what inputs to supply)
  - Warnings & guardrails
  - Example input(s) and gold output(s)
  - Evaluation rubric & tests
  - Engine settings (temperature, max_tokens, model hints)
  - Changelog (commit hash + notes)

## PromptSpec Template (cursor-friendly)
PromptSpec: <feature>-v<major>

Goal:
One-sentence description of objective.

ReturnFormat:
JSON schema or explicit Markdown layout.

Context:
List all fields required in the context object. Example:
{ eventMeta, classResults[], laneUsageStats, incidents[] }

Warnings:

Do not invent driver names or positions.

If required data missing, return needs_data: true.

ExampleInput:
{ ... } // small real sample

GoldOutput:
{ ... } // desired output for the example input

EngineSettings:
temperature: 0.15
top_p: 0.9
max_tokens: 400
model_hint: "Auto; prefer deterministic models (low-temp) for facts, GPT-5 when complexity > X"

Evaluation:

Exactness: 0-10

Grounding: 0-10

Format adherence: 0-5

Tone/style: 0-5

Safety: 0-5

ScoreThreshold: 27

### Recommended Prompting Patterns (for Cursor)
1. **System+Role**: Use a strict system prompt to lock role and behavior.
2. **Strict Return Format**: Prefer JSON for machine consumption; include a short `analysis` object for debugging.
3. **Few-shot**: Include 1–2 gold examples in PromptSpec to enforce style/format.
4. **Step-back / Decompose**: Ask LLM to produce a short analysis block (2-4 bullets) and then the final output.
5. **Low Temperature for Facts**: ≤ 0.25 for recap/record tasks. Higher temp ok for creative tasks.
6. **Model Hints**: Use Auto mode; override with GPT-5 for complex frontend logic or Claude for critical deterministic fixes.

## Hallucination Guardrails
- If any required field is missing, `needs_data: true` and `missing_fields: [...]` MUST be returned.
- No invention of driver names, times, or identifiers.
- Strip or flag PII and sensitive info before sending outside repo.
- For creative outputs, enforce explicit safe boundaries.

## Prompt Testing & Validation (in-Cursor)
- Keep `/testing/prompts/<feature>/` with example input JSONs and `validate_prompt.sh`.
- For code-generation prompts, require generated unit tests and run them automatically.
- Use low-variance settings (temp 0.0–0.2) for validation runs.

## Example Minimal Prompt
System:
"You are EPC17's race editor. Only return JSON matching the schema. If required data missing, set needs_data: true."

User:
"Generate a race recap using the following context: <JSON>"

## Prompt Recipes – Frontend JS Example
Goal: Create a `TaskBoard` React component with drag-and-drop.

System:
"You are a senior React dev. Follow EPC17_RULES.mdc. Return patch + tests."

User:
"Build a Kanban TaskBoard with 3 columns (Todo, Doing, Done). Data shape: [{id,title,status}]. Include keyboard-accessible drag-and-drop and Jest tests verifying movement + ARIA attributes."
