# AGENTS.md — Convention for AI Tools

This document defines the **mandatory red line** for any AI tool (Claude Code, other agents, scripted automation) operating inside this repository.

---

## Red line — no data under `~/.flowmcp/`

> **Forbidden:** Storing grading data under `~/.flowmcp/` or anywhere below the user-home that is not covered by an existing documented convention. The user-home contains very important files (`.env` keys), and Claude tools have repeatedly caused damage there in the past — an emotionally and factually substantiated red line.
>
> — Memo 076, Chapter 14, line 580

Grading results, intermediate states, evaluation scratch files, and any other artifact produced by grading runs **MUST NEVER** be written under `~/.flowmcp/` or to any other location inside the user-home directory. The user-home contains critical files (e.g. `~/.flowmcp/.env` with API keys) and has been the source of real, repeated damage caused by AI tooling.

---

## Correct location — `grading-data/` inside this repo

Grading results **MUST** be written to `./grading-data/` inside this repository, using the convention:

```
grading-data/<schemaId>/<timestamp>.json
```

The folder `grading-data/` is `.gitignore`-d and **MUST NEVER** be pushed to the remote (see `README.md` and `.gitignore` for the NICHT-PUSH Convention).

The triple documentation (README, AGENTS.md, commented `.gitignore`) is the deliberate safeguard that allows us to keep grading results inside the repo while preventing accidental push.

---

## Rules for AI tools

1. Read this file before running any grading-related command in this repository.
2. Write all grading output to `grading-data/<schemaId>/<timestamp>.json` and nowhere else.
3. Never write to `~/.flowmcp/`, `~/Library/`, or any path outside this repository.
4. Never push the `grading-data/` folder to the remote. The `.gitignore` excludes it; do not edit `.gitignore` to include it.
5. Never auto-create or auto-overwrite `.env` files anywhere (Memo 032 PRD-01 rule).
6. When in doubt, stop and ask the user. The user owns the decision about data placement and push timing.

---

## References

- Memo 076 (this repo's source-of-truth memo) — `projects/flowmcp/.memo/076-schema-quality-grading-spec/`
- Memo 032 (env-file rules) — `projects/flowmcp/.memo/032-env-konfiguration-und-key-management/`
- Global `~/.claude/CLAUDE.md` — environment variable (`.env`) rules
- This repository's `README.md` — NICHT-PUSH Convention for `grading-data/`
