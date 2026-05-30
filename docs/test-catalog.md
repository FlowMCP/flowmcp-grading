# Code Test Catalog (Jest)

This page lists all engine tests of the `flowmcp-grading` repo. **Not to be
confused with the [Eval Question Catalog](./question-catalog.md)** — that one
lists the questions an LLM sub-agent answers during a grading run.

| Artifact | What it is |
|----------|-----------|
| **Code test (this page)** | Jest test of the engine classes — runs via `npm test` |
| **Eval question** ([catalog](./question-catalog.md)) | LLM question to a sub-agent — sent inside the prompt |

These two catalogs make the distinction explicit between the deterministic
engine tests and the non-deterministic evaluator questions, which is otherwise
easy to conflate.

## tests/unit/

| File | Scope | Subject under test |
|------|-------|--------------------|
| `AboutConsistencyCheck.test.mjs` | `src/AboutConsistencyCheck.mjs` | About-page verification at namespace level |
| `BumpHelper.test.mjs` | `src/BumpHelper.mjs` | Version-bump logic (semver major/minor/patch) |
| `ErrorCodes.test.mjs` | `src/ErrorCodes.mjs` | Central error/status codes — format + severity |
| `FolderScanner.test.mjs` | `src/FolderScanner.mjs` | Filesystem crawl + filter |
| `Grading.test.mjs` | `src/Grading.mjs` | `createEntry`, `addGrading`, `computeAggregateGrade`, `applyRegradingTrigger`, `checkAging` |
| `HashGenerator.test.mjs` | `src/HashGenerator.mjs` | Deterministic sha256 hash for schema + selection |
| `NaReason.test.mjs` | `src/NaReason.mjs` | Allowed list of `n/a` reasons |
| `PartialGrading.test.mjs` | `src/Phases/PartialGrading.mjs` | Partial-mode runner — subset of areas |
| `PreConditionCheck.test.mjs` | `src/PreConditionCheck.mjs` | Member precondition (selection grading) |
| `PromptBuilder.test.mjs` | `src/PromptBuilder.mjs` | Prompt assembly per area, persona logic |
| `Scoring.test.mjs` | `src/Scoring.mjs` | `scoreDimension`, `validateScore`, `computeWeightedSum` |
| `Selection.test.mjs` | `src/Phases/Selection.mjs` | `runS1`..`runS4` + `runAll` |
| `SelectionLockfile.test.mjs` | `src/SelectionLockfile.mjs` | `selection.lock.json` — member hashes + reproducibility |
| `SharedLists.test.mjs` | `src/SharedLists.mjs` | Shared-list resolver |
| `SourceSnapshot.test.mjs` | `src/SourceSnapshot.mjs` | Schema snapshot with hash (source-of-truth layout) |
| `StablePromotion.test.mjs` | `src/StablePromotion.mjs` | `gradingStatus` promotion from `experimental` → `stable` |
| `Veto.test.mjs` | `src/Veto.mjs` | Categorical veto (4 triggers), `applyVeto`, `isVetoed` |
| `build-questions.test.mjs` | `scripts/build-questions.mjs` | Question-catalog generator — YAML frontmatter → JSON |
| `build-test-catalog.test.mjs` | `scripts/build-test-catalog.mjs` | Generator: questions → code-test bucket mapping |
| `index.test.mjs` | `src/index.mjs` | Public API surface (`gradeSingleSchema`, `gradeSelection`, ...) |

## tests/integration/

| File | Scope | Subject under test |
|------|-------|--------------------|
| `partial-full-sequence.test.mjs` | Engine end-to-end | Full → Partial → Full sequence + `StablePromotion` across the sequence |
| `skills.test.mjs` | `skills/*/SKILL.md` | Evaluator skill header (frontmatter, allowed-tools, model) |

## tests/manual/

| File | Scope | Subject under test |
|------|-------|--------------------|
| `audit-non-tool-scope.mjs` | Non-tool-scope audit | Manual code audit of non-tool areas + public-only principle |

## tests/helpers/

| File | Scope | Subject under test |
|------|-------|--------------------|
| `fixtures.mjs` | Shared fixtures | Pure factory functions for unit tests (grading entries, veto examples) |
| `sample-schemas.mjs` | Schema fixtures | Pure factory functions for `HashGenerator`/`SourceSnapshot` tests |

## Running

```bash
npm test                       # all Jest tests
npm run test:coverage:src      # with coverage report
node tests/manual/audit-non-tool-scope.mjs   # ad-hoc manual audit
```

## Cross-reference

- **`prompts/generated/test-catalog.md`** (auto-generated) — lists, per eval
  question, which code test (bucket) already covers the deterministic part.
  Complements this page, does not replace it.
- **`docs/question-catalog.md`** — auto-generated index of the LLM eval questions.
