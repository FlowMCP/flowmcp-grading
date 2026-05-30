---
policyId: http-400-not-pass
version: 1.0.0
enforced: true
appliesTo: areas with tool-executable or response-status dimensions
---

## Rule

HTTP responses with 4xx status codes (in particular 400, 401, 403, 422)
MUST NOT be classified as PASS — not even with an "auth-pass" heuristic.
PASS = HTTP 200 (or success codes explicitly specified as PASS by the API).

## Rationale

Grading spec: a prior incident misclassified a 4xx response as PASS. Spec 06 §4
(determinism) requires strictly deterministic response evaluation. The
auth-pass heuristic is forbidden.

## Enforcement in the PromptBuilder

The pre-instructions contain this block:

```text
When evaluating an HTTP response: PASS = status 200 (or a code explicitly
specified as success). Status 4xx is FAIL/DEFECT, even if the response body
contains "Auth missing" or "Bad Request". No auth-pass heuristic.
```

The builder inserts this block automatically when the template contains the
question dimension `tool-executable` or `response-status`.
Violation at build/eval time: `PB-103: http 4xx classified as PASS`.

## Violation Examples

- Evaluator answers `score: PASS, note: "401 is auth-pass, key is just missing"`
- Output schema allows `{ "httpStatus": 422, "verdict": "PASS" }`
