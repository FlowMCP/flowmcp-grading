---
policyId: no-hidden-defaults
version: 1.0.0
enforced: true
appliesTo: all
---

## Rule

Templates, pre-instructions, and persona blocks MUST NOT contain silent
defaults (`x || "default"`, empty placeholder fallbacks). All parameters MUST
be filled explicitly, or a build error MUST be raised.

## Rationale

No-hidden-defaults and no-silent-defaults are project standards. Silent
defaults distort eval results and are not reproducible. The persona-optional
logic is an explicitly declared variation, not a silent default.

## Enforcement in the PromptBuilder

PromptBuilder throws an error on `{{...}}` placeholders that cannot be filled.
No automatic empty-string substitution. With `personaRequired: false`, the
persona block is replaced by an **explicitly declared** empty-string logic.
Error code: `PB-104: placeholder unfilled — no silent default permitted`.

## Violation Examples

- `PromptBuilder` contains `template.replace("{{X}}", value || "")` — silent
- Frontmatter `personaRequired: false` without an explicit empty-block marker
  in the template body
- Files-to-read list contains an optional path without an
  `{{IF_PRESENT}}` marker
