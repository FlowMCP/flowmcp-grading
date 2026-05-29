---
policyId: evaluator-neutrality
version: 1.0.0
enforced: true
appliesTo: all
---

## Regel

Der Evaluator-Sub-Agent DARF im Prompt nicht ueber das Optimierungsziel des
Generators informiert werden. Verbesser-/Verstaerken-/Vorzieh-Anweisungen
sind Generator-Eigenschaft, keine Evaluator-Eigenschaft.

## Begruendung

Memo 082 Kap 4.2 — Generator kennt das Optimierungsziel, Evaluator NICHT.
Wuerde der Evaluator das Ziel kennen, wuerde er auf das Ziel hin optimieren
statt neutral zu bewerten. Recursive-Loop-Architektur (Memo 082 Kap 12)
verlangt diese Trennung.

## Durchsetzung im PromptBuilder

PromptBuilder hat eine Block-Liste von Phrasen (`verbessere`, `optimiere`,
`bevorzuge`, `wenn moeglich, dann ...`). Pre-Build-Check des aggregierten
Prompts gegen die Block-Liste. Bei Treffer: Warning + Build-Fail-Option
(Konfig-Schalter in `EnvironmentManager`). Error-Code:
`PB-102: evaluator-neutrality violation — generator hint detected in prompt`.

## Verletzungs-Beispiele

- Frage-Block enthaelt „Bewerte streng — wir wollen Grade A erreichen"
- Persona-Block enthaelt „Diese Persona neigt zu hohen Bewertungen"
- Pre-Instructions enthalten „Beachte besonders die Dimension X (wichtig
  fuer den Loop)"
