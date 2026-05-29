# Code-Test-Katalog (Jest)

Diese Seite listet alle Engine-Tests des `flowmcp-grading`-Repos. **Nicht zu
verwechseln mit dem [Eval-Frage-Katalog](./question-catalog.md)** — der listet
die Fragen, die ein LLM-Sub-Agent waehrend eines Gradings beantwortet.

| Artefakt | Was es ist |
|----------|-----------|
| **Code-Test (diese Seite)** | Jest-Test der Engine-Klassen — laeuft via `npm test` |
| **Eval-Frage** ([Katalog](./question-catalog.md)) | LLM-Frage an Sub-Agent — wird im Prompt verschickt |

Quelle: Memo 082, Kap 2 (`Test-Beweis — 22 Code-Tests vs. Eval-Fragen-Katalog`) und
Kap 3 (`Realer vs gefuehlter Status`). Die zwei Kataloge machen den Unterschied
explizit, der in Memo 082 als „Doku-Problem" identifiziert wurde.

## tests/unit/

| Datei | Scope | Pruef-Gegenstand |
|-------|-------|-------------------|
| `AboutConsistencyCheck.test.mjs` | `src/AboutConsistencyCheck.mjs` | About-Page-Verifikation auf Namespace-Ebene |
| `BumpHelper.test.mjs` | `src/BumpHelper.mjs` | Versions-Bump-Logik (semver Major/Minor/Patch) |
| `ErrorCodes.test.mjs` | `src/ErrorCodes.mjs` | Zentrale Fehler-/Status-Codes — Format + Severity |
| `FolderScanner.test.mjs` | `src/FolderScanner.mjs` | Filesystem-Crawl + Filter |
| `Grading.test.mjs` | `src/Grading.mjs` | `createEntry`, `addGrading`, `computeAggregateGrade`, `applyRegradingTrigger`, `checkAging` |
| `HashGenerator.test.mjs` | `src/HashGenerator.mjs` | Deterministischer sha256-Hash fuer Schema + Selection |
| `NaReason.test.mjs` | `src/NaReason.mjs` | Allowed-Liste der `n/a`-Begruendungen (Memo 054) |
| `PartialGrading.test.mjs` | `src/Phases/PartialGrading.mjs` | Partial-Mode-Runner — Teilmenge an Bereichen |
| `PreConditionCheck.test.mjs` | `src/PreConditionCheck.mjs` | Member-Pre-Condition (Selection-Grading, Memo 080) |
| `PromptBuilder.test.mjs` | `src/PromptBuilder.mjs` | Prompt-Erzeugung pro Bereich, Persona-Logik |
| `Scoring.test.mjs` | `src/Scoring.mjs` | `scoreDimension`, `validateScore`, `computeWeightedSum` |
| `Selection.test.mjs` | `src/Phases/Selection.mjs` | `runS1`..`runS4` + `runAll` |
| `SelectionLockfile.test.mjs` | `src/SelectionLockfile.mjs` | `selection.lock.json` — Member-Hashes + Reproduzierbarkeit |
| `SharedLists.test.mjs` | `src/SharedLists.mjs` | Shared-List-Resolver (Memo 080 Phase 5) |
| `SourceSnapshot.test.mjs` | `src/SourceSnapshot.mjs` | Schema-Snapshot mit Hash (Source-of-Truth-Layout) |
| `StablePromotion.test.mjs` | `src/StablePromotion.mjs` | `gradingStatus` Promotion von `experimental` → `stable` |
| `Veto.test.mjs` | `src/Veto.mjs` | Categorical-Veto (4 Trigger), `applyVeto`, `isVetoed` |
| `build-questions.test.mjs` | `scripts/build-questions.mjs` | Fragen-Katalog-Generator — YAML-Frontmatter → JSON |
| `build-test-catalog.test.mjs` | `scripts/build-test-catalog.mjs` | Generator: Fragen → Code-Test-Bucket-Mapping |
| `index.test.mjs` | `src/index.mjs` | Public-API-Surface (`gradeSingleSchema`, `gradeSelection`, ...) |

## tests/integration/

| Datei | Scope | Pruef-Gegenstand |
|-------|-------|-------------------|
| `partial-full-sequence.test.mjs` | Engine end-to-end | Full → Partial → Full Sequence + `StablePromotion` ueber die Sequenz |
| `skills.test.mjs` | `skills/*/SKILL.md` | Evaluator-Skill-Header (Frontmatter, allowed-tools, model) |

## tests/manual/

| Datei | Scope | Pruef-Gegenstand |
|-------|-------|-------------------|
| `audit-non-tool-scope.mjs` | Memo 080 PRD-21 Audit | Manueller Code-Audit Non-Tool-Bereiche + Public-only-Prinzip |

## tests/helpers/

| Datei | Scope | Pruef-Gegenstand |
|-------|-------|-------------------|
| `fixtures.mjs` | Shared Fixtures | Pure Factory-Funktionen fuer Unit-Tests (Grading-Entries, Veto-Beispiele) |
| `sample-schemas.mjs` | Schema-Fixtures | Pure Factory-Funktionen fuer `HashGenerator`/`SourceSnapshot`-Tests |

## Ausfuehrung

```bash
npm test                       # alle Jest-Tests
npm run test:coverage:src      # mit Coverage-Report
node tests/manual/audit-non-tool-scope.mjs   # Manual-Audit ad-hoc
```

## Quervergleich

- **`prompts/generated/test-catalog.md`** (autogeneriert) — listet pro Eval-Frage,
  welcher Code-Test (Bucket) den deterministischen Teil bereits abdeckt. Ergaenzt
  diese Seite, ersetzt sie nicht.
- **`docs/question-catalog.md`** — autogenerierter Index der LLM-Eval-Fragen.
