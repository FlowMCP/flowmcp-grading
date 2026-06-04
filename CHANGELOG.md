# Changelog

All notable changes to `flowmcp-grading` are documented here.

## 2.3.0 — 2026-06-04

### Added

- **`DeterministicAreaMapper`** — a deterministic Answer-Mapper that turns a
  `DataPretest` result plus the structural-validation outcome into spec-conformant
  deterministic grading entries for the two "free" areas of the area-dependency graph:
  `single-test` (per tool, dimension `outputSchemaMatch`, derived from the working-test
  bar) and `tools-aggregate-schema` (per schema, dimension `schemaStructureValid`).
  It makes no LLM call — the grader kind is `script`, every grading is
  `determinism: deterministic`, and the produced entry is `gradingMode: partial`
  (tier-capped at grade B). Key-gated tools are skipped (not evaluable, never a fail).
  Exported from the package entry alongside `AreaScorer`.
- `AreaScorer` is now re-exported from the package entry (previously harness-internal),
  so consumers can resolve `_gradings/` dirs and write timestamped-additive entries.

### Changed

- `DataPretest` persistence now performs a **stale-test cleanup**: when a re-run
  produces fewer tests for a tool than a previous run, the surplus `test-<n>.json`
  files (index above the new count) are moved to a reversible `.trash/` snapshot under
  the grading-data root — never hard-deleted. Honours `dryRun` (no writes at all).

## 2.2.0 — 2026-06-04

- Deterministic data-pretest dry-run and per-tool classes (parameterless Bar=1,
  key-gated, needs-tests). See the grading specification for the normative model.

## 2.1.0

- Earlier release (see git history).
