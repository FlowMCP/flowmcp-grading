# AGENTS.md — flowmcp-grading Conventions for AI Agents

This file describes the binding conventions for all AI agents (Claude Code,
script-driven automation, other agents) that work in this repository.

---

## Source-of-Truth Principle

The graded schema is frozen together with the grading result. Concretely, each
graded schema is stored as a snapshot under `grading-data/schemas/<namespace>/<schemaHash>--v<X.Y.Z>.mjs`.
The original source remains in `flowmcp-schemas-private/` — changes to the source do NOT
alter the snapshot. A new grading run produces a new snapshot with a new hash.

This keeps every grading reproducible, even if the source schema evolves later.

---

## Core Rule — no data under `~/.flowmcp/`

> **Forbidden:** Writing grading data under `~/.flowmcp/` or anywhere below the user home.
> The user home contains critical files (`~/.flowmcp/.env` with API keys),
> and AI tools have repeatedly caused damage there — a well-founded hard line.

Grading results, intermediate states, and all other artifacts must live in `./grading-data/` inside
this repository. Never in `~/.flowmcp/`, `~/Library/`, or any other path outside this
repository.

---

## Folder Structure

```
grading-data/
├── schemas/                      Source-of-Truth (frozen schema snapshots, FLAT GLOBAL BASE)
│   └── <namespace>/
│       ├── namespace.json        Payload with members[] + namespaceHash + aboutHash
│       ├── about/
│       │   └── <aboutHash>--about.md
│       └── <schemaHash>--v<X.Y.Z>.mjs  (frozen snapshot)
├── shared-lists/                 Shared lists
├── single/                       Single-schema gradings
│   └── <namespace>--<tool>/
│       └── gradings/
│           └── <schemaHash>--<timestamp>.json
├── selection/                    Selection gradings (skill families)
│   └── <selectionId>/
│       ├── selection.json
│       ├── selection.lock.json
│       ├── about/<aboutHash>--about.md
│       ├── skills/<skillname>.mjs   (max 4)
│       └── gradings/<selectionHash>--<timestamp>.json
├── projects/                     Per-project entries (index + project selections)
│   └── <projectName>/
│       ├── index.json            Single index — data-pretest / single-grading / selection-grading all write here
│       └── selection/
│           └── <selectionId>/
│               ├── selection.json
│               └── selection.lock.json
└── phase-status/                 Lifecycle tracking per schema/selection
    ├── single/<namespace>--<tool>.json
    └── selection/<selectionId>.json
```

The `schemas/` base is **flat and global** — it is shared across all projects and there is
**no per-project schema duplication**. A project entry under `projects/<projectName>/` holds a
single `index.json` plus the project's own selections. A selection member **references** a
flat-base snapshot by `schemaId`; it never copies the snapshot file.

### Reference + optional override

A selection member references a flat-base schema and MAY carry an optional `override` layer that
adapts the presented tool `name` / `description` at selection level. The override is applied
**on-top and is non-mutating**: the frozen schema snapshot and its `schemaHash` stay untouched.
Because the override is part of `selection.json`, it flows into the `selectionHash` only. Only the
whitelisted keys `name` and `description` are accepted. See
[`docs/project-index-layout.md`](docs/project-index-layout.md) for the concrete index contract and
an example.

---

## Single vs. Selection — clear separation

| Area      | What is graded?                     | Where do gradings live?                         |
|-----------|-------------------------------------|-------------------------------------------------|
| Single    | A single schema (tool)              | `single/<namespace>--<tool>/gradings/`          |
| Selection | A skill family (multiple tools)     | `selection/<selectionId>/gradings/`             |

The separation is binding because single and selection have different lifecycles, and the
pre-condition validator (see next section) must read the two status axes cleanly separated.

---

## Pre-Condition Rule (mandatory)

Aggregated checks — selection grading and about verification — are blocked until ALL
member schemas of a selection carry the status `gradingStatus: "stable"`. The pre-condition validator
reads `grading-data/phase-status/single/<namespace>--<tool>.json` for each member and checks it
deterministically before the start of each selection grading.

As long as a single member schema still carries `gradingStatus: "pending"`, the selection grading
is rejected with a clear error message.

---

## Grading Mode

- **First grading entry of a schema:** `gradingMode: "full"` is mandatory — `aggregateGrade`
  is computed only in this case.
- **Iteration steps:** may be `"partial"` or `"full"`. Partial gradings update
  individual dimensions without recomputing `aggregateGrade`.
- **Stable promotion:** `gradingStatus` switches to `"stable"` only if the last entry
  was `gradingMode: "full"` and all tier-trim checks pass.

---

## Hash Conventions

| Hash             | Computation input                           | Format         |
|------------------|---------------------------------------------|----------------|
| `schemaHash`     | Canonical JSON of the schema                | sha256, first 8 characters |
| `namespaceHash`  | Canonical JSON of `members[]` + `aboutHash` | sha256, first 8 characters |
| `selectionHash`  | Canonical JSON of `selection.json`          | sha256, first 8 characters |
| `aboutHash`      | sha256 of the `about.md` content            | sha256, first 8 characters |

In the current pilot phase, the schema snapshots carry `PLACEHOLDER###` markers — a later phase replaces
these with real hashes via the HashGenerator.

---

## Forbidden Operations

1. **Schema snapshots** in `grading-data/schemas/<namespace>/<hash>--v<X.Y.Z>.mjs` must NOT be edited
   manually — only replaced via migration/grading scripts. Snapshots are frozen.
2. **Phase-status files** under `grading-data/phase-status/` must NOT be edited manually — only
   written by the grading pipeline.
3. **`namespace.json` files** must NOT be edited manually — only via `scripts/generate-namespace-json.mjs`.
4. **`.env` files** must never be auto-created or overwritten anywhere.
5. **`~/.flowmcp/`** and other paths outside this repository must NOT be written to.
6. **`.gitignore`** must not be edited in a way that would push `grading-data/`.
7. **Entry-point prompt** must NOT be anticipated here — it is built in separately.

---

## Rules for AI Tools

1. Read this file before every grading run in the repo.
2. Write gradings exclusively to `grading-data/single/...` or `grading-data/selection/...`.
3. Produce schema snapshots exclusively via the migration scripts, not ad hoc.
4. When in doubt, stop and ask the user. The user decides on data placement
   and push timing.
5. Never automatically create or overwrite `.env` files.

---

## References

- Active spec: `gradingSpec/1.1.0` under `flowmcp-spec/grading/1.1.0/`
- Predecessor spec: `gradingSpec/1.0.0` under `flowmcp-spec/grading/1.0.0/` (read-only)
- Global `~/.claude/CLAUDE.md` — env rules
- `README.md` in this repo — quickstart and migration notes
