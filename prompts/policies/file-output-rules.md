---
policyId: file-output-rules
version: 1.0.0
enforced: true
appliesTo: all
---

## Regel

Alle vom Evaluator referenzierten und vom Generator geschriebenen Files
MUESSEN zu einem der drei Folder-Typen passen (Memo 082 Kap 4.6):

1. **Public Repo** — Engine-Code, Templates, Skills, Specs, Tests,
   Skripte, Docs
2. **Gitignored Arbeits-Folder** `grading-data/` — Eval-Outputs,
   Lens-Vorlagen, Pilot-Gradings
3. **Memo-Folder** `.memo/` — Memo-Revisionen, internes Working-Material

Working-Files (Inventur-Berichte, Lessons-Reports, Mini-Praxis-Logs)
DUERFEN nicht ins Public Repo.

## Begruendung

Memo 082 Kap 4.6 + User-Direktive REV-05 (Zitat im Memo). Belegt durch
`flowmcp-grading/.gitignore:1` (`grading-data/`) und `:18` (`.memo/`).

## Durchsetzung im PromptBuilder

PromptBuilder validiert Files-to-Read-Pfade vor Build. Path muss matchen:

- `^(repos/flowmcp-grading/(src|prompts|skills|spec|tests|scripts|docs)/)`
  — Public Repo
- `^(repos/flowmcp-grading/grading-data/)` — Gitignored
- `^(\.memo/)` — Memo-Folder

Andere Pfade (z.B. `/tmp/`, `~/.flowmcp/`, absolute Pfade ausserhalb
Workspace) — Build-Fehler `PB-301: file path not in allowed folder-type`.

## Verletzungs-Beispiele

- Files-to-Read enthaelt `~/.flowmcp/.env` (siehe auch Policy 1)
- Generator schreibt Lessons-Report nach
  `repos/flowmcp-grading/docs/lessons-2026.md` (Public — soll ins
  gitignored Folder)
- Evaluator-Prompt referenziert `/tmp/persona.md`
