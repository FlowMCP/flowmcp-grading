---
policyId: evaluator-neutrality
version: 1.0.0
enforced: true
appliesTo: all
---

## Rule

The evaluator sub-agent MUST NOT be told the generator's optimization goal in
the prompt. Improve / reinforce / prefer instructions are a property of the
generator, not of the evaluator.

## Rationale

The generator knows the optimization goal; the evaluator does NOT. If the
evaluator knew the goal, it would optimize toward that goal instead of
evaluating neutrally. The recursive-loop architecture requires this separation.

## Enforcement in the PromptBuilder

PromptBuilder maintains a block list of phrases (`improve`, `optimize`,
`prefer`, `if possible, then ...`). Pre-build check of the aggregated prompt
against the block list. On a match: warning + build-fail option (config switch
in `EnvironmentManager`). Error code:
`PB-102: evaluator-neutrality violation — generator hint detected in prompt`.

## Violation Examples

- Question block contains "Grade strictly — we want to reach Grade A"
- Persona block contains "This persona tends to give high scores"
- Pre-instructions contain "Pay special attention to dimension X (important
  for the loop)"
