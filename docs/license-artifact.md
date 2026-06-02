# License Artifact — Grading/Island Model

**Decision source:** Memo 097 Kap. 6, F5 = A (User, 2026-06-03).

This document specifies the grading-side license model. The key principle:
license assessment is a **private creator assessment**, kept inside the island
(`grading-data/`, gitignored) and NOT added as a public schema field.

---

## Three-Layer Separation

| Layer | What it is | Where it lives | Public? |
|-------|-----------|----------------|---------|
| FlowMCP code license | MIT | `LICENSE` in each repo | Yes |
| Provider ToS / data license | Link only — URL or `no-tos-found` sentinel | Schema `main.termsOfService` (MUST field, Memo 097 Kap. 6) | Yes (link only) |
| Creator legal assessment | Grader's private opinion — NOT legally binding | Island only (`grading-data/`, gitignored) | No |

FlowMCP observes ToS — it does NOT interpret, accept, or certify them. The
committed `grade.json` (written by `ProviderProof.write`) carries NO
`legalAssessment` field. The public schema carries NO `legalAssessment` field.

---

## `legalAssessment` — Island Artifact

### Mandatory disclaimer (constant)

Every `legalAssessment` record MUST include exactly this disclaimer string,
verbatim, as the `disclaimer` field:

```
"grader assessment, not legally binding"
```

No variation. No abbreviation.

### Shape (island-internal only)

```jsonc
{
  "namespace": "<provider-namespace>",
  "assessedAt": "<ISO-8601 date>",
  "disclaimer": "grader assessment, not legally binding",
  "tosUrl": "<URL or 'no-tos-found'>",
  "robotsTxtStatus": "green | yellow | red | unchecked",
  "usageCategory": "open | restricted | commercial-ok | commercial-restricted | unknown",
  "notes": "<free text — private, never published>"
}
```

Field rules:

| Field | Required | Notes |
|-------|----------|-------|
| `namespace` | Yes | Must match the island provider folder name |
| `assessedAt` | Yes | ISO 8601 date (`2026-MM-DD`) |
| `disclaimer` | Yes | Verbatim constant — see above |
| `tosUrl` | Yes | URL string OR the literal `"no-tos-found"` |
| `robotsTxtStatus` | Yes | `"green"` / `"yellow"` / `"red"` / `"unchecked"` (see Memo 090 Kap. 6, 7-step gate) |
| `usageCategory` | Yes | Closed enum — see below |
| `notes` | No | Free text, private, NEVER copied to any public artifact |

`usageCategory` enum:

| Value | Meaning |
|-------|---------|
| `"open"` | No-restrictions / open data / CC0 / public domain |
| `"restricted"` | Significant ToS restrictions (no bulk, no commercial, etc.) |
| `"commercial-ok"` | Commercial use explicitly permitted |
| `"commercial-restricted"` | Commercial use explicitly forbidden |
| `"unknown"` | No ToS found or ToS not yet reviewed |

---

## `licenses-internal.json` — Location and Format

This file LIVES IN THE ISLAND, not in the repo. It is gitignored.

**Intended location:**

```
~/.flowmcp/grading/licenses-internal.json
```

Or, if `gradingDataDir` is customized in `~/.flowmcp/config.json`:

```
<gradingDataDir>/licenses-internal.json
```

**Top-level format:**

```jsonc
{
  "schemaVersion": "1",
  "entries": {
    "<namespace>": { /* legalAssessment shape — see above */ },
    "<namespace>": { /* ... */ }
  }
}
```

**crate-before-use:** The file does NOT need to exist for grading to run. It is
created on demand when the first legal assessment is recorded. Code that reads
it MUST handle a missing file gracefully (return empty `entries: {}`), and code
that writes it MUST check for existence first — never overwrite without reading
(NO SILENT DEFAULTS, CLAUDE.md).

---

## What `ProviderProof.write` Does NOT include

`ProviderProof.#renderProof` (`src/ProviderProof.mjs`) builds the committed
`grade.json` with:
- `proofVersion`, `namespace`, `generatedAt`, `status`
- `namespaceAggregate` (grade, normalizedScore, ref, reason — no legal fields)
- `schemas` (projected status/grade/reason — no legal fields)
- `blockers[]`
- `monitoring` (githubIssue, boardColumn)

None of these fields carry `legalAssessment`, `usageCategory`, `tosUrl`, or
`disclaimer`. Adding any of those to the proof shape requires an explicit PRD;
do not add them ad-hoc.

---

## Relationship to Schema `main.termsOfService`

The schema field `main.termsOfService` (MUST, per Memo 097 Kap. 6 / PRD-ToS-Docs-Mandatory)
carries a **URL** or the sentinel `"no-tos-found"`. It is public and part of the
schema validation rules. It is NOT the `legalAssessment` — it is just the link.

The `legalAssessment` is the private grader opinion built from reading that URL
(and running the robots.txt check). These two live in completely separate places
and must not be conflated.

---

## Cross-refs

- `src/ProviderProof.mjs` — `#renderProof` (proof shape, no legal fields)
- `docs/harness.md` — grading run context
- Memo 097 Kap. 6 — F4 (ToS/Docs MUST), F5 (license = island artifact)
- Memo 090 Kap. 6 — robots.txt 7-step gate (maps to `robotsTxtStatus` field)
- `prompts/output-schemas/` — area output schemas (no `legalAssessment` in any)
