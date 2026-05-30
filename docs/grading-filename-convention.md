# Grading Filename Convention

| Field | Value |
|------|------|
| **Status** | Implementation-Reference |
| **Helper** | `Grading.formatGradingFilename({ hash, ts, persona })` in `src/Grading.mjs` |

This convention defines the pattern for grading entry files. Filename construction must run **exclusively** through the helper — direct string concatenation in callers is forbidden (validation in the helper catches malformed slugs, hashes, and timestamps).

---

## Pattern

```
<hash>--<ts>--<persona-slug>.json
```

| Segment | Format | Example |
|---------|--------|---------|
| `hash` | 6-16 hex characters (schema hash, sha256 prefix) or `PLACEHOLDER\d{3}` (backward-compat for pilot files) | `a1b2c3d4` |
| `ts` | ISO 8601 with `-` instead of `:` (filesystem-safe) | `2026-05-30T10-15-00Z` |
| `persona-slug` | `neutral` OR `<basePersona>--<lens>` (two lower-kebab slugs, separated by `--`) | `decision-maker--crypto-trader` |

---

## Examples

- With persona: `a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json`
- Neutral: `abc123--2026-05-29T03-00-00Z--neutral.json`
- Pilot/Legacy: `PLACEHOLDER001--2026-05-29T03-00-00Z--neutral.json`

Sortability: filenames are grouped lexicographically by `hash`, then chronologically by `ts`, then by `persona`. As a result, `ls grading-data/.../gradings/` naturally sorts all entries of the same schema together and in chronological order.

---

## Which persona slug when?

Per area (persona-application table):

| Area | Persona slug |
|---------|--------------|
| 1 `single-test` | `neutral` |
| 2 `tools-aggregate-schema` | `neutral` |
| 3 `namespace-description` | `neutral` |
| 4 `tools-aggregate-namespace` | `neutral` |
| 5 `about-namespace` | `<basePersona>--<lens>` |
| 6 `about-selection` | `<basePersona>--<lens>` |
| 7a `selection-skills-L1` | `<basePersona>--<lens>` |
| 7b `selection-skills-L2` | `<basePersona>--<lens>` |
| 7c `selection-skills-L3` | `<basePersona>--<lens>` |
| 8 `namespace-skills` | `<basePersona>--<lens>` |

---

## Helper

Filenames may only be built via `Grading.formatGradingFilename({ hash, ts, persona })` — no string concatenation in callers. Validation in the helper catches malformed slugs, hashes, and timestamps.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: 'a1b2c3d4',
    ts: '2026-05-30T10-15-00Z',
    persona: 'decision-maker--crypto-trader'
} )
// → 'a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json'
```

Errors are thrown as `throw new Error(...)` with GRD codes:

| Code | Meaning |
|------|-----------|
| `GRD-040` | hash does not match the pattern (6-16 hex OR `PLACEHOLDER\d{3}`) |
| `GRD-041` | ts does not match the pattern (ISO 8601 with `-` instead of `:`) |
| `GRD-042` | persona is neither `'neutral'` nor `<base>--<lens>` (two lower-kebab slugs) |

---

## Location

Files land in the **gitignored** folder:

- Single: `grading-data/single/<ns>--<tool>/gradings/<filename>`
- Selection: `grading-data/selection/<sel>/gradings/<filename>`

Both folder branches are excluded by `.gitignore` — grading outputs never land in the public repo.

---

## Backward-Compat (No FS Overwrites)

Existing pilot files using the old pattern `PLACEHOLDER\d{3}--<ts>.json` (without a `persona` segment) are **not** deleted or renamed (the "No FS Overwrites Without Ask" rule). They remain readable via `Grading.readEntry({ json })`, which fills missing loop fields with defaults (`iteration: 0`, `improvementHints: []`, `persona: 'neutral'`) — read-only.

---

## References

- Spec `19-folder-layout.md` §17 (naming convention `<gradingId>.json`)
