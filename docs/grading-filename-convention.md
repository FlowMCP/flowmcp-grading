# Grading-Filename-Konvention (Memo 082, Phase 2h)

| Feld | Wert |
|------|------|
| **Status** | Implementation-Reference |
| **Source** | PRD-21 (Memo 082 Phase 2h) |
| **Helper** | `Grading.formatGradingFilename({ hash, ts, persona })` in `src/Grading.mjs` |

Diese Konvention legt das Pattern fuer Grading-Eintragsdateien fest. Filename-Bildung darf **ausschliesslich** ueber den Helper laufen — direkter String-Concat in Aufrufern ist verboten (Validierung im Helper faengt fehlerhafte Slugs, Hashes und Timestamps ab).

---

## Pattern

```
<hash>--<ts>--<persona-slug>.json
```

| Segment | Format | Beispiel |
|---------|--------|----------|
| `hash` | 6-16 hex Zeichen (Schema-Hash, sha256-Praefix) oder `PLACEHOLDER\d{3}` (Backward-Compat fuer Pilot-Files) | `a1b2c3d4` |
| `ts` | ISO 8601 mit `-` statt `:` (Filesystem-Safe) | `2026-05-30T10-15-00Z` |
| `persona-slug` | `neutral` ODER `<basePersona>--<lens>` (zwei lower-kebab-Slugs, durch `--` getrennt) | `decision-maker--crypto-trader` |

---

## Beispiele

- Mit Persona: `a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json`
- Neutral: `abc123--2026-05-29T03-00-00Z--neutral.json`
- Pilot/Legacy: `PLACEHOLDER001--2026-05-29T03-00-00Z--neutral.json`

Sortierbarkeit: Filenames sind lexikographisch nach `hash` gruppiert, danach chronologisch nach `ts`, dann nach `persona`. Damit sortiert `ls grading-data/.../gradings/` natuerlich alle Eintraege desselben Schemas zusammen und in zeitlicher Reihenfolge.

---

## Wann welcher Persona-Slug?

Pro Bereich (Memo 082 Kap 7.4 — Persona-Anwendungs-Tabelle):

| Bereich | Persona-Slug |
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

Filename darf nur via `Grading.formatGradingFilename({ hash, ts, persona })` gebildet werden — kein String-Concat in Aufrufern. Validierung im Helper faengt fehlerhafte Slugs, Hashes und Timestamps ab.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: 'a1b2c3d4',
    ts: '2026-05-30T10-15-00Z',
    persona: 'decision-maker--crypto-trader'
} )
// → 'a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json'
```

Fehler werden als `throw new Error(...)` mit GRD-Codes geworfen:

| Code | Bedeutung |
|------|-----------|
| `GRD-040` | hash entspricht nicht dem Pattern (6-16 hex ODER `PLACEHOLDER\d{3}`) |
| `GRD-041` | ts entspricht nicht dem Pattern (ISO 8601 mit `-` statt `:`) |
| `GRD-042` | persona ist weder `'neutral'` noch `<base>--<lens>` (zwei lower-kebab-Slugs) |

---

## Lokation

Files landen im **gitignored** Folder (Memo 082 Kap 4.6):

- Single: `grading-data/single/<ns>--<tool>/gradings/<filename>`
- Selection: `grading-data/selection/<sel>/gradings/<filename>`

Beide Folder-Aeste werden von `.gitignore` ausgeschlossen — Grading-Outputs landen niemals im Public Repo.

---

## Backward-Compat (No FS Overwrites)

Bestehende Pilot-Files mit dem alten Pattern `PLACEHOLDER\d{3}--<ts>.json` (ohne `persona`-Segment) werden **nicht** geloescht oder umbenannt (Memo-Regel „No FS Overwrites Without Ask"). Sie bleiben lesbar via `Grading.readEntry({ json })`, das fehlende Loop-Felder mit Defaults (`iteration: 0`, `improvementHints: []`, `persona: 'neutral'`) befuellt — read-only.

---

## Referenzen

- Memo 082 REV-05 Kap 4.3 (Diagramm Save-Step), Kap 4.6 (Folder-Typen), Kap 7.4 (Persona-Anwendung), Kap 13 (Persona-Slug-Konvention)
- PRD-20 (gradings-JSON Erweiterung: iteration, improvementHints, persona)
- PRD-14 (Generator-Skills — apply-improvement verwendet diesen Helper)
- Spec `19-folder-layout.md` §17 (Naming-Konvention `<gradingId>.json`)
