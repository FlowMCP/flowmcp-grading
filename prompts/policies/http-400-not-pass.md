---
policyId: http-400-not-pass
version: 1.0.0
enforced: true
appliesTo: areas with tool-executable or response-status dimensions
---

## Regel

HTTP-Responses mit Status-Codes 4xx (insbesondere 400, 401, 403, 422)
DUERFEN NICHT als PASS klassifiziert werden — auch nicht mit
„auth-pass"-Heuristik. PASS = HTTP 200 (oder explizit als PASS
spezifizierte Erfolgs-Codes der API).

## Begruendung

FlowMCP-Memory `feedback_http_400_is_not_pass` — Incident in Memo 033 REV-12
mit Fehlklassifikation. Spec 06 §4 (Determinism) verlangt streng
deterministische Response-Bewertung. Auth-pass-Heuristik ist verboten.

## Durchsetzung im PromptBuilder

Pre-Instructions enthalten den Block:

```text
Bei HTTP-Response-Bewertung: PASS = Status 200 (oder explizit als Erfolg
spezifizierter Code). Status 4xx ist FAIL/DEFECT, auch wenn der
Response-Body „Auth missing" oder „Bad Request" enthaelt. Keine
Auth-pass-Heuristik.
```

Builder fuegt diesen Block automatisch ein, wenn das Template die
Frage-Dimension `tool-executable` oder `response-status` enthaelt.
Verletzung zur Build-/Eval-Zeit: `PB-103: http 4xx classified as PASS`.

## Verletzungs-Beispiele

- Evaluator antwortet `score: PASS, note: "401 ist auth-pass, Key fehlt nur"`
- Output-Schema erlaubt `{ "httpStatus": 422, "verdict": "PASS" }`
