---
policyId: file-output-rules
version: 1.0.0
enforced: true
appliesTo: all
---

## Rule

All files referenced by the evaluator and written by the generator MUST match
one of the three folder types:

1. **Public repo** — engine code, templates, skills, specs, tests,
   scripts, docs
2. **Gitignored working folder** `grading-data/` — eval outputs,
   lens templates, pilot gradings
3. **Memo folder** `.memo/` — memo revisions, internal working material

Working files (inventory reports, lessons reports, practical-test logs)
MUST NOT go into the public repo.

## Rationale

Defined by the grading spec. Backed by `flowmcp-grading/.gitignore`, which
ignores `grading-data/` and `.memo/`.

## Enforcement in the PromptBuilder

PromptBuilder validates the files-to-read paths before build. A path must match:

- `^(repos/flowmcp-grading/(src|prompts|skills|spec|tests|scripts|docs)/)`
  — Public repo
- `^(repos/flowmcp-grading/grading-data/)` — Gitignored
- `^(\.memo/)` — Memo folder

Other paths (e.g. `/tmp/`, `~/.flowmcp/`, absolute paths outside the
workspace) — build error `PB-301: file path not in allowed folder-type`.

## Violation Examples

- Files-to-read contains `~/.flowmcp/.env` (see also Policy 1)
- Generator writes a lessons report to
  `repos/flowmcp-grading/docs/lessons-2026.md` (public — should go into the
  gitignored folder)
- Evaluator prompt references `/tmp/persona.md`
