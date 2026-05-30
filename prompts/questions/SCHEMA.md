# Question Catalog — Entry Schema (v1.0.0)

> Source: grading spec — entry schema, file layout, deterministic vs.
> non-deterministic classification, the eight areas, and the
> persona-application table.

---

## 1. Purpose

This document defines the binding entry schema and file layout for the question
catalog of the grading module. All questions are stored as Markdown files with
YAML frontmatter; the build script `scripts/build-questions.mjs` aggregates them
into `prompts/generated/questions.json` and validates them against this schema.

The question catalog is part of the generator-evaluator recursive feedback loop.
It contains 60-80 questions spread across 10 areas (eight areas, with area 7
split into L1/L2/L3).

---

## 2. Required Fields (14)

Each question has exactly 14 required fields in its YAML frontmatter:

| Field | Type | Format | Example | Definition |
|------|-----|--------|----------|------------|
| `id` | string | `Q-<area>-<NN>` | `Q-single-test-01` | Unique question ID. Regex `^Q-[a-zA-Z0-9-]+-\d{2}$` (uppercase allowed for `selection-skills-L1/L2/L3`). |
| `area` | enum | see 3. | `single-test` | Area slug from the 10-item list. |
| `dimension` | enum | see 4. | `descriptionClarity` | Dimension from P1-P7 / S1-S4 or a grading-spec extension. |
| `question` | string | free text, max 500 chars | `Is the tool description free of marketing terms?` | The actual eval question in plain text. |
| `scoreType` | enum | `boolean`, `scale-1-5`, `percent` | `boolean` | Scale type of the answer. |
| `weight` | number | 0.0 - 1.0 | `0.15` | Weight within the `(area, tier)` bucket. |
| `determinism` | enum | `deterministic`, `non-deterministic`, `mixed` | `non-deterministic` | Determinism classification — determines whether an LLM is required. |
| `tier` | enum | see 4. | `P3` | P1-P7 (single) or S1-S4 (selection). |
| `filesToRead` | array<string> | path templates with placeholders | `["{{schemaPath}}", "{{aboutPath}}"]` | Pre-instruction files (section 8). At least 1 entry. |
| `preInstructionRef` | string | relative path | `pre-instructions/single-test.md` | Reference to the mandatory block. |
| `evaluatorTask` | string | imperative, max 200 chars | `Evaluate the description for marketing language.` | Instruction to the sub-agent. |
| `outputSchemaRef` | string | relative path | `output-schemas/single-test.schema.json` | JSON schema for the answer. |
| `personaRequired` | boolean | `true`/`false` | `false` | Persona application; must match the area mapping. |
| `version` | string | semver | `1.0.0` | Question version for change tracking. |

---

## 3. area Enum (10 values)

The eight areas, with area 7 split into L1/L2/L3:

| area slug | Sub-template? | personaRequired (default) |
|-----------|---------------|----------------------------|
| `single-test` | no | false |
| `tools-aggregate-schema` | no | false |
| `namespace-description` | no | false |
| `tools-aggregate-namespace` | no | false |
| `about-namespace` | no | true |
| `about-selection` | no | true |
| `selection-skills-L1` | yes (`selection-skills`) | true |
| `selection-skills-L2` | yes (`selection-skills`) | true |
| `selection-skills-L3` | yes (`selection-skills`) | true |
| `namespace-skills` | no | true |

Persona-application mapping:

- Areas 1-4 = **Neutral** (`personaRequired: false`)
- Areas 5-8 = **WITH persona** (`personaRequired: true`)

---

## 4. dimension Enum + Tier Mapping

Tier list:

- **P1-P7** — single dimensions (tool-centric)
- **S1-S4** — selection dimensions (coverage, persona fit, skill adequacy, domain-document alignment)

Grading-spec extension (binding):

- `namespaceDescriptionClarity` (area 3, P bucket)
- `domainCoverage` (area 4, P bucket)

Tier mapping per area:

| area | tier bucket | example dimensions |
|------|-------------|----------------------|
| `single-test` | P1, P2, P3 | descriptionClarity, paramConsistency, exampleQuality |
| `tools-aggregate-schema` | P4, P5 | routesCoherence, namingConsistency |
| `namespace-description` | P bucket (grading-spec extension) | namespaceDescriptionClarity |
| `tools-aggregate-namespace` | P bucket | domainCoverage |
| `about-namespace` | P6, P7 | personaReference, valueProposition |
| `about-selection` | P6, P7 | personaReference, useCaseClarity |
| `selection-skills-L1` | S1, S2 | coverage, personaFit |
| `selection-skills-L2` | S2, S3 | personaFit, skillAdequacy |
| `selection-skills-L3` | S3, S4 | skillAdequacy, domainAlignment |
| `namespace-skills` | S3, S4 | skillAdequacy, domainAlignment |

The exact dimensions are set per question during calibration.

---

## 5. File-Layout Convention

```
prompts/questions/
├── deterministic/
│   ├── 01-docs-url-reachable.md
│   ├── 02-output-schema-matches-response.md
│   └── ...
├── non-deterministic/
│   ├── 01-description-clarity.md
│   ├── 21-about-namespace-persona-reference.md
│   └── ...
└── mixed/            # part of the convention, currently empty
```

Convention (authoritative — this is the single source of truth, enforced by
`scripts/build-questions.mjs`):

- Each deterministic test and each non-deterministic question is exactly **one**
  self-describing file. The filename alone reveals what is tested/asked, so the
  catalog is readable without opening any code.
- Path template: `prompts/questions/<determinism>/<NN>-<slug>.md`
- `<determinism>` = `deterministic` | `non-deterministic` | `mixed`. The subfolder
  name **must equal** the frontmatter `determinism` field. A mismatch fails the
  build (`FOLDER-DETERMINISM-MISMATCH`, exit code != 0, question path in the message).
- `<NN>` = 01..99, ascending locally per subfolder, with a leading zero
- `<slug>` = lowercase kebab-case, max 50 chars, ASCII only (no umlauts; transliterate, e.g. `ae`, `oe`, `ue`, `ss`)
- Filename **must** match the regex `^\d{2}-[a-z0-9-]+\.md$`. A violation fails the
  build (`FILENAME-PATTERN`).
- The `mixed/` subfolder is part of the convention but is currently empty; the
  build skips empty subfolders without error. Do not invent placeholder content —
  add a `mixed/` file only when a real partial-code/partial-LLM question exists.

Rationale: sorting by `determinism` makes the build output groupable and lets the
test catalog map deterministic questions directly to `flowmcp-core` tests, while
non-deterministic questions map to `no-code-test (LLM-only)`.

Single loader: `scripts/build-questions.mjs` aggregates every question file into
`prompts/generated/questions.json`. Skills and tooling import **only** that
aggregated JSON (filtered by `area`) — never individual Markdown files directly.
There is no second, parallel question/test structure.

---

## 6. Frontmatter Convention

Each question file has a YAML frontmatter block at the start of the file
(between `---` markers) with all 14 required fields. The body afterward is
OPTIONAL and serves only as a human-readable explanation — the build script
does not carry it into `questions.json`.

```yaml
---
id: Q-single-test-01
area: single-test
dimension: descriptionClarity
question: "Is the tool description free of marketing terms?"
scoreType: boolean
weight: 0.15
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Evaluate the description for marketing language (buzzwords, adjectives without substance)."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Marketing language distorts the user's expectation of the tool. A description
should be descriptive ("Returns contract metadata"), not promotional ("Powerful
contract API").

## Anti-Pattern

- "Powerful", "Advanced", "Easy-to-use" — no technical information
- Superlatives without evidence
```

---

## 7. Complete Example Question

The question `Q-single-test-01` above is the complete template for all other
questions. It is stored physically in `prompts/questions/non-deterministic/`.

---

## 8. Validation Rules (anticipating build-questions.mjs)

The build script `scripts/build-questions.mjs` checks per question:

1. Filename matches `^\d{2}-[a-z0-9-]+\.md$` (otherwise `FILENAME-PATTERN`)
2. Subfolder name equals the `determinism` field (otherwise `FOLDER-DETERMINISM-MISMATCH`)
3. All 14 required fields present (otherwise `MISSING-FIELD`)
4. `id` matches the regex `^Q-[a-zA-Z0-9-]+-\d{2}$`
5. `area` is in the 10-item enum list (section 3)
6. `determinism` and `scoreType` are within their enums
7. `filesToRead` is a non-empty array
8. `personaRequired` must match the area mapping (areas 1-4 = false, 5-8 = true)
9. The sum of the `weight` values per `(area, tier)` bucket is between 0.95 and 1.05
   (tolerance for rounding errors)

If a check fails, the build script aborts with exit code != 0 and names the
question path in the error message.

---

## 9. Versioning

- Schema version: `1.0.0` (this document)
- Per question: the `version` field in the frontmatter (semver)
- Schema-breaking changes (e.g. new required fields) bump the schema major
  version and trigger a bulk update of all question `version` fields

---

## 10. Cross-Refs

- Entry-schema source: grading spec
- File-layout source: grading spec
- Determinism classification: grading spec
- Tier list: grading spec
- Persona application: grading spec
- Question content (60-80 questions): question catalog
- Build script: `scripts/build-questions.mjs`
- Test-catalog script: `scripts/build-test-catalog.mjs`
