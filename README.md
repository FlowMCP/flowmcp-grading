# flowmcp-grading

Reference implementation of the FlowMCP Grading-Spec (`gradingSpec/1.0.0`) — a normative, RFC2119-aligned specification for evaluating the quality of FlowMCP schemas and selections. This repository hosts the spec documents (`spec/1.0.0/`), the source modules that implement Scoring, Grading, and Veto logic, the LLM grader prompts, and the test suite. The spec is a **living document** and evolves with the FlowMCP schema corpus.

---

## NICHT-PUSH-Konvention für `grading-data/`

> **WARNING — DO NOT PUSH `grading-data/`.**
>
> The folder `grading-data/` contains all grading run results (`grading-data/<schemaId>/<timestamp>.json`). It is **explicitly listed in `.gitignore`** and **MUST NEVER be pushed** to the remote. This is a deliberate convention chosen to keep grading results inside the repo (so AI tools can find them via a predictable relative path) while preventing accidental leakage of data and intermediate states to the public.
>
> This **NICHT-PUSH-Konvention** is documented in three places: this README, `AGENTS.md`, and the commented entry in `.gitignore`. If you add new tooling that writes grading results, write them only to `grading-data/` — never anywhere else.

Background — the red line that prevents writing data under `~/.flowmcp/` is documented in `AGENTS.md`. AI tools have caused damage in the user-home in the past; this repo provides the **correct** location instead.

---

## Quickstart

```bash
git clone https://github.com/FlowMCP/flowmcp-grading.git
cd flowmcp-grading
npm install

# Example call (public API arrives in Phase 6)
# flowmcp-grading grade <schemaPath>
# Result is written to grading-data/<schemaId>/<timestamp>.json
```

---

## Repository Layout

```
flowmcp-grading/
├── README.md                 # This file (prominent NICHT-PUSH note for grading-data/)
├── AGENTS.md                 # Convention for AI tools (red line "no data under ~/.flowmcp/")
├── .gitignore                # With commented grading-data/ entry
├── package.json              # ES Modules, Node 22
├── src/
│   ├── index.mjs             # Public API (filled in Phase 6)
│   └── Phases/               # Skill-family directories
├── spec/
│   └── 1.0.0/                # Grading-Spec chapters (00-overview.md, 01-..., ...)
├── prompts/                  # Versioned LLM grader prompts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── helpers/
└── grading-data/             # .gitignore'd — grading results live here
    └── .keep                 # Keeps folder in repo
```

---

## Versioning — three independent namespaces

This repository tracks three independently versioned namespaces (Memo 076, F5):

- `gradingSpec/1.0.0` — the specification documents under `spec/1.0.0/`
- `scoringSystem/1.0.0` — the scoring rules and dimensions
- `gradingSystem/1.0.0` — the grading rules, veto logic, and tier mapping

These versions are **never coupled**. Bumping one does not imply bumping the others.

---

## Hierarchy

The FlowMCP Schemas Specification at `repos/flowmcp-spec/spec/v4.1.0/` (highest instance) defines what a schema, a selection, and the primitives are. This Grading-Spec sits below and describes **how** schemas and selections are evaluated. See `spec/1.0.0/00-overview.md` for the full hierarchy table.

---

## Status

Phase 1 of the Memo 076 rollout — repository skeleton only. The Scoring/Grading/Veto modules, the test suite, and the public API are filled in subsequent phases.
