# Output-Schema to gradings[] — Field Mapping

| Field | Value |
|-------|-------|
| Status | Implementation-Reference |
| Targets | `prompts/output-schemas/_master.schema.json`, `flowmcp-spec/grading/1.1.0/08-grading-model.md` |

This document maps every field of the Evaluator-Response Master Envelope (and
of the per-area schemas) onto the durable grading entry defined in Spec 08.
Implementers of the generator skills (`*-apply-improvement`) and the
recursive-loop engine MUST consult this document when
translating an evaluator response into a Spec-08-conformant grading entry.

---

## Master-Envelope Mapping

The Master envelope (`prompts/output-schemas/_master.schema.json#/$defs/envelope`)
carries every metadata field that the loop generator needs to address an
evaluator response. The table below maps each envelope field to its
destination in a Spec-08-conformant `<gradingId>.json` file or to a sidecar
location.

| Output-schema field | Type | Mapping to Spec 08 | Note |
|--------------------|-----|---------------------|-------|
| `gradingId` | `string` (`<hash>--<ts>`) | Top-level `gradingId` (Spec 08 §3.X) | 1:1 pass-through. Pattern from Spec 19 §17. |
| `schemaHash` | `string` (8-hex) | Top-level `schemaHash` (Spec 08 §3.X) | 1:1 pass-through. 8-hex prefix of the sha256 over the canonical schema JSON. |
| `area` | enum (10 areas) | **Intentionally unmapped** at top level | Acts only as a routing key in the generator; per `gradings[i]`, the area-specific `dimension` values apply. See §4.6 (area → dimension). |
| `iteration` | `integer` 1–5 | **Sidecar** (`gradings/<gradingId>.loop.json`) | Spec 08 has no `iteration` field today; planned as a future spec extension (out-of-scope here). |
| `timestamp` | `string` ISO-8601 | Top-level `gradings[i].timestamp` (Spec 08 §4) | Pass-through per response element. |
| `persona` | `null` OR `{ basePersonaId, lensId }` | `gradings[i].selectionContext.personaIds[]` + sidecar lens | Split: basePersona → personaIds (Spec 08 §4.X), lensId → sidecar (Spec 12 §4 lens not yet represented in §4). See §4.4. |
| `answers[]` | Array of `answer` | `gradings[]` array (Spec 08 §4) | 1:N expansion (see §4.3). |
| `improvementHints[]` | Array of `improvementHint` | **Sidecar** (`gradings/<gradingId>.loop.json`) | Spec 08 has no hint field; loop-internal only. Persisted only for generator diagnostics. |

---

## `answer`-Element Mapping

Each element of `answers[]` (Master `$defs.answer`) becomes one element of
`gradings[]` (Spec 08 §4). The five answer-level fields map as follows:

| Output-schema field | Type | Mapping to Spec 08 `gradings[i]` | Note |
|--------------------|-----|------------------------------------|-------|
| `questionId` | `string` (`Q-<area>-NN`) | **Intentionally unmapped** — question ID is resolved into `dimension` | Generator translates question ID → `dimension` enum value via `prompts/generated/questions.json` lookup. The question ID itself is not persisted. |
| `score` | `number` 1.0–5.0 OR enum | `gradings[i].score` | 1:1 pass-through, Spec 08 §5.2 enum set identical (`pass`/`fail`/`stale`/`n/a`). |
| `reasoning` | `string` | `gradings[i].reasoning` | 1:1 pass-through. |
| `evidence` | `string` \| `object` | `gradings[i].evidence` | 1:1 pass-through. Optional — both schemas allow the field as optional. |
| `naReason` | enum (6 values) | `gradings[i].naReason` | 1:1 pass-through, closed set identical (Spec 08 §5.3). Mandatory when `score = "n/a"` — enforced by the Master-schema `if/then`. |

### Derived Fields (Generator-Added)

The following Spec-08 fields are added deterministically by the generator from the
question catalog and the sub-agent configuration, **not**
supplied by the evaluator:

| Field | Source | Value |
|------|--------|------|
| `gradings[i].dimension` | Question-ID lookup | from `prompts/generated/questions.json` (field `dimension`) |
| `gradings[i].weight` | Question catalog | from `prompts/generated/questions.json` (field `weight`, default 1.0) |
| `gradings[i].determinism` | Question catalog | `non-deterministic` (evaluator is always an LLM) — alternatively value from questions.json |
| `gradings[i].graderIdentity` | Generator | `{ kind: "llm", name: "<modelName>", version: "<version>" }` |
| `gradings[i].llmModel` | Generator | `<modelName>` (from sub-agent configuration) |
| `gradings[i].selectionContext` | Output-schema `persona` | `{ groupId: <area>, personaIds: [basePersonaId], domainDocId: <domainDoc> }` |

---

## `persona` Field — Split + Sidecar

Spec 12 §4 defines the lens concept (domain-specific sharpening of a
base persona). Spec 08 §4 `selectionContext.personaIds[]` carries only
**base-persona IDs** — no lens information.

Solution — split:

| Sub-field | Mapping |
|----------|---------|
| `persona.basePersonaId` | → `gradings[i].selectionContext.personaIds[0]` |
| `persona.lensId` | → sidecar `gradings/<gradingId>.loop.json` field `persona.lensId` |

File naming convention: `<basePersonaId>--<lensId>` or
`neutral` — the filename is the compact representation, the sidecar JSON the
complete one.

---

## Sidecar File: `<gradingId>.loop.json`

Loop-provenance fields that Spec 08 (today) does not represent live in a
**sidecar file** next to the grading artifact:

```
grading-data/single/<ns>--<tool>/gradings/
+- <gradingId>.json          (Spec-08-conformant)
+- <gradingId>.loop.json     (sidecar, loop provenance)
```

**Sidecar content:**

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "iteration": 2,
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add concrete trigger sentence for the balance-lookup use case.",
            "priority": "high"
        }
    ],
    "persona": {
        "basePersonaId": "decision-maker",
        "lensId": "crypto-trader"
    },
    "loopHistory": [
        { "iteration": 1, "completedAt": "2026-05-29T15-30Z" },
        { "iteration": 2, "completedAt": "2026-05-29T15-34Z" }
    ]
}
```

The sidecar file is **gitignored** like the rest of `grading-data/`.

Rationale for sidecar instead of a Spec-08 extension **today**: the iteration
counter is explicitly **out-of-scope** as a spec extension and deferred to a
follow-up. Until then, the information lives in the sidecar — the Spec-08 file
stays strictly conformant.

---

## area → dimension Selection (area-specific)

Spec 08 §5.1.1 lists 17 single dimensions + §5.1.2 lists 4
selection dimensions. Per output-schema area, the
generator restricts itself to a **subset** of these dimensions:

| Area (output-schema) | Allowed Spec-08 dimensions (`gradings[i].dimension`) | Tier |
|--------------------------|---------------------------------------------------------|------|
| `single-test` | `docsUrlReachable`, `outputSchemaMatch`, `apiKeyDomainMatch`, `whenToUse`, `parameters`, `outputSchemaConformance`, `descriptionNeutrality`, `completeness`, `formattingCompliance`, `apiAvailability` | `autonomous` |
| `tools-aggregate-schema` | `routesUniqueNames`, `outputSchemaConformance`, `completeness`, `descriptionNeutrality` | `autonomous` |
| `namespace-description` | `descriptionNeutrality`, `completeness`, `personaUseCaseFit` (substitute for the planned `namespaceDescriptionClarity`, out-of-scope) | `autonomous` |
| `tools-aggregate-namespace` | `domainCoverage`, `domainConformance`, `completeness` | `autonomous` |
| `about-namespace` | `aboutConventionCompliance`, `personaUseCaseFit` | `autonomous` |
| `about-selection` | `aboutConventionCompliance`, `personaUseCaseFit` | `group-bound` |
| `selection-skills-L1` | `selectionSkillL1` | `group-bound` |
| `selection-skills-L2` | `selectionSkillL2` | `group-bound` |
| `selection-skills-L3` | `selectionSkillL3` | `group-bound` |
| `namespace-skills` | `namespaceSkillValidity` | `autonomous` |

**Consequence:** The generator sets `gradingTier` and `maxAttainableGrade`
(Spec 08 §8) deterministically from the output-schema `area` field:

| `area` | `gradingTier` | `maxAttainableGrade` |
|--------|---------------|----------------------|
| `single-test` | `autonomous` | `B` |
| `tools-aggregate-schema` | `autonomous` | `B` |
| `namespace-description` | `autonomous` | `B` |
| `tools-aggregate-namespace` | `autonomous` | `B` |
| `about-namespace` | `autonomous` | `B` |
| `namespace-skills` | `autonomous` | `B` |
| `about-selection` | `group-bound` | `A` |
| `selection-skills-L1` | `group-bound` | `A` |
| `selection-skills-L2` | `group-bound` | `A` |
| `selection-skills-L3` | `group-bound` | `A` |

---

## Example Transformation

### Sub-agent response (output-schema conformant)

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "schemaHash": "a1b2c3d4",
    "area": "single-test",
    "iteration": 2,
    "timestamp": "2026-05-29T15:34:00Z",
    "persona": null,
    "answers": [
        {
            "questionId": "Q-single-test-04",
            "score": 4.0,
            "reasoning": "whenToUse description contains a clear trigger sentence."
        }
    ],
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add reference to crypto-trader persona use case.",
            "priority": "medium"
        }
    ]
}
```

### Generator output — Spec-08 file `<gradingId>.json`

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "schemaId": "etherscan.getBalance",
    "schemaHash": "a1b2c3d4",
    "schemaVersion": "1.0.0",
    "version": "4.0.0",
    "gradingMode": "partial",
    "aboutHash": "ef56gh78",
    "gradingTier": "autonomous",
    "scoringSystem": "scoringSystem/1.0.0",
    "gradingSystem": "gradingSystem/1.0.0",
    "gradings": [
        {
            "dimension": "whenToUse",
            "score": 4.0,
            "weight": 1.0,
            "determinism": "non-deterministic",
            "graderIdentity": {
                "kind": "llm",
                "name": "claude-opus-4-7",
                "version": "1m"
            },
            "llmModel": "claude-opus-4-7",
            "selectionContext": {
                "groupId": "single-test",
                "personaIds": [],
                "domainDocId": "n/a"
            },
            "timestamp": "2026-05-29T15:34:00Z",
            "reasoning": "whenToUse description contains a clear trigger sentence."
        }
    ],
    "categoricalVeto": null,
    "aggregateGrade": "B",
    "maxAttainableGrade": "B"
}
```

### Generator output — sidecar `<gradingId>.loop.json`

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "iteration": 2,
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add reference to crypto-trader persona use case.",
            "priority": "medium"
        }
    ],
    "persona": null
}
```

---

## Intentionally-Unmapped Fields

Output-schema fields that are **deliberately** not mapped directly to Spec 08:

| Field | Reason |
|------|-------|
| `area` (top-level) | Routing key; in the persisted artifact, the `dimension` values of `gradings[i]` are sufficient. |
| `questionId` | Compose-time identifier; semantically redundant after resolution into `dimension`. |
| `iteration` | Spec 08 has no iteration field today (out-of-scope) — lives in the sidecar. |
| `improvementHints[]` | Loop-internal, not durable — lives in the sidecar. |
| `persona.lensId` | Spec 12 §4 lens concept not yet represented in Spec 08 §4 — lives in the sidecar + filename. |

---

## `categoricalVeto` Mapping (Spec 08 §6)

The Master schema models **no** veto branch in the `oneOf` today.
Rationale: the evaluator sub-agent is not authorized to issue a categorical
veto — that is a deterministic check
(api-key-domain-mismatch, malicious-module, illegal-content) or a
special `ai-security-veto` operation of the engine layer, not of the
per-area evaluator.

Consequence for the mapping: `categoricalVeto = null` is the **default** in the
generator output, overwritten only by engine code (not by
sub-agent responses). This separation is normative — the evaluator has no
veto authority.

---

## `regradingTrigger` Mapping (Spec 08 §11)

The recursive loop is **not** a `regradingTrigger` in the
Spec-08 sense — it happens *within* a grading run, not between
two completed grading artifacts. `regradingTrigger` is set only
when:

- a user re-grades an existing `<gradingId>.json` via CLI/issue (`user-report`)
- a scheduled re-run runs (`scheduled`)
- a `scoringSystem` bump or `gradingSystem` bump invalidates all artifacts

→ **Intentionally unmapped** at the loop level. The generator sets
`regradingTrigger` only in the three Spec-08 §11 cases, not as a
loop-iteration marker.

---

## Spec Extension Reference

The following output-schema fields are **deliberately** persisted as a sidecar
and should be folded into the spec in a **follow-up** — these
extensions are explicitly marked **out-of-scope** here:

- `iteration` — loop-iteration counter (top-level or `gradings[i].context`)
- `improvementHints[]` — generator feedback-loop persistence
- `persona.lensId` — lens concept in `selectionContext` (today only base-persona ID)

Until such a follow-up extends the spec, the sidecar convention from
§4.5 is binding. Implementers of the loop engine MUST write
both files — the Spec-08 file AND the `.loop.json` sidecar — within the same
transaction block.

---

## References

- Spec `08-grading-model.md` §3 (top-level fields), §3.X (5 mandatory fields from 1.1.0), §4 (gradings[] element), §5.1.1 (17 single dimensions), §5.1.2 (4 selection dimensions), §5.3 (n/a naReason), §6 (categoricalVeto), §8 (tier-trim + maxAttainableGrade), §11 (regradingTrigger)
- Spec `12-personas-contract.md` §1 (4 base personas), §4 (lens concept)
- Spec `13-skills.md` §3 (namespaceSkillValidity), §4 (selectionSkillL1/L2/L3)
- Spec `19-folder-layout.md` §17 (naming convention `<gradingId>.json`)

---

## Annex: Module-specific Fields

The following fields are **NOT** defined in `gradingSpec/1.1.0` but are
mandatory at the module level for all entries from the current phase onward.
They are accepted, validated, and included in the persisted JSON by the
generator (`src/Grading.mjs#createEntry`).

| Field | Type | Source | Validation code |
|------|-----|--------|-----------------|
| `iteration` | integer (`0..10`) | Recursive feedback loop | `GRD-030` |
| `improvementHints` | string[] | Loop mechanics | `GRD-031` |
| `persona` | string (`'neutral'` OR `<base>--<lens>`) | Parallel personas | `GRD-032` |

### Spec extension — out-of-scope

The spec-extension proposal for the iteration counter is explicitly
out-of-scope. When spec `1.2.0` adopts these fields,
the mapping here will be updated to "spec-conformant from 1.2.0".

### Backward-Compat (read path)

Legacy entries (pilot files) without these fields are read with
defaults — `Grading.readEntry({ json })`:

| Field | Default on read |
|------|-------------------|
| `iteration` | `0` |
| `improvementHints` | `[]` |
| `persona` | `'neutral'` |

**Important:** These defaults apply **exclusively** when reading
legacy files. `createEntry()` rejects missing fields as undefined
(no silent defaults) — whoever wants to set the field MUST pass it
explicitly.

### Filename convention (cross-ref)

The `persona` field in the JSON body is consistent with the `persona` segment in
the filename (see `docs/grading-filename-convention.md`). Filename construction
may only run via `Grading.formatGradingFilename({ hash, ts, persona })`.

### Example entry (new)

```json
{
    "gradingId": "a1b2c3d4--2026-05-30T10-15Z",
    "schemaId": "etherscan.getContractEthereum",
    "schemaHash": "a1b2c3d4",
    "gradingTier": "autonomous",
    "iteration": 2,
    "improvementHints": [],
    "persona": "decision-maker--crypto-trader",
    "gradings": [],
    "categoricalVeto": null,
    "aggregateGrade": "B",
    "maxAttainableGrade": "B"
}
```

### Cross-References

- Recursive-loop logic in the `*-start-grade` skills (skill bodies)
- This annex (module entry schema)
- Persona-slug filename convention (`docs/grading-filename-convention.md`)
