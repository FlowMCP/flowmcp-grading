---
policyId: persona-only-where-required
version: 1.0.0
enforced: true
appliesTo: all (frontmatter-driven)
---

## Rule

A persona block MAY only be used in templates whose frontmatter sets
`personaRequired: true`. With `personaRequired: false`, the
`{{PERSONA_BLOCK}}` placeholder is replaced by an **empty section with a
marker comment** — not silently by an empty string.

## Rationale

Per the persona-application table in the grading spec. Tools (areas 1, 2, 3, 4)
are evaluated neutrally; skills + About (areas 5, 6, 7a/b/c, 8) are evaluated
with a persona. Mixing them distorts the results and makes the persona
requirement non-transparent.

## Enforcement in the PromptBuilder

PromptBuilder reads `personaRequired` from the template frontmatter.
With `false`: the persona block is replaced by:

```text
<!-- Persona block intentionally empty: this area is evaluated neutrally. -->
```

With `true`: the builder requires `basePersona` and `lens` as parameters; if
one is missing, build error `PB-201: personaRequired=true, but persona|lens not
provided`. Reverse violation (persona supplied with
`personaRequired: false`): `PB-202: persona parameters supplied for neutral
area`.

## Violation Examples

- An area-1 template (neutral) is called with persona parameters
- An area-5 template (with persona) is called without a persona
- The persona block is accidentally left as `{{PERSONA_BLOCK}}` in the
  final prompt
