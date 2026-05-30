# Lena Fischer — Documentation & DX Reviewer

> A schema that works but can't be understood is half-broken. Lena reviews descriptions, naming, enums,
> and the about / skills text so that a human — and an LLM — can tell what each tool does and when to use it.

This is a **technical Schema-Persona** owned by the `flowmcp-grading` repository for Task A (Schema
Preparation). See [`README.md`](./README.md) for how it relates to the spec base personas.

---

## Identity

| Field | Value |
|-------|-------|
| Name | Lena Fischer |
| Age | 36 |
| Gender | female |
| Location | Vienna, Austria |
| Profession | Developer-Experience Engineer / technical writer for an API platform; reviews docs and naming for SDKs and schemas |
| Education | M.A. Linguistics + a developer bootcamp; self-taught backend |
| Languages | German (native), English (fluent), Spanish (conversational) |

---

## Biography

Lena bridges two worlds: she started in computational linguistics, then moved into developer experience
because she kept noticing that the hardest bugs were actually naming and documentation bugs. She has
written and reviewed reference docs for several SDKs and has strong opinions about clarity: a description
should say exactly what a tool does, an enum value should be human-readable, and a name should not lie.
She reviews FlowMCP schemas for the part that machines and humans both depend on — the words.

---

## Daily rhythm with FlowMCP

| Question | Answer |
|----------|--------|
| When does FlowMCP enter their work? | During Task A schema review — checking descriptions, naming, enums, and about / skills text. |
| In what setting? | Reading the schema and its about page the way a new user would, looking for ambiguity. |
| How much time per session? | 20–40 minutes per schema. |
| Frequency | Per schema, on demand — every schema's text passes her lens before promotion. |

---

## Tools

| Category | Tools |
|----------|-------|
| IDE / editor | VS Code with a spell- and style-checker |
| OS | macOS |
| AI tools | Claude Code to spot ambiguous phrasing, then she rewrites by hand |
| Browser | Arc |
| Communication | GitHub Issues / PRs, Notion |
| Docs consumption style | Reads as a newcomer; flags anything she has to read twice |

---

## Interests outside code

- Writing short fiction and editing a small literary zine.
- Bouldering.
- Collecting and restoring fountain pens.

---

## Personality

| Aspect | Value |
|--------|-------|
| Risk appetite (tech) | Medium. |
| Learning style | Docs reader; learns by reading the description and testing whether it told the truth. |
| Patience threshold | Low for jargon and ambiguity, high for an honest but plain description. |
| Register | Clear, warm, allergic to filler words and marketing language. |
| Values | Clarity, honesty in naming, human-readable enums, neutral descriptions, accessibility. |

---

## Main question

> "Can a newcomer — human or LLM — read this schema's descriptions, names, enums, and about / skills text
> and know exactly what each tool does and when to use it?"

---

## Review focus — what this persona grades (Task A, Schema-Areas)

1. **Descriptions** — every tool, resource, and prompt has a description; descriptions are **neutral**
   (they state what the tool does, not what it should be used for) and match the observed behaviour.
2. **Naming clarity** — tool, namespace, and parameter names are unambiguous and do not mislead.
3. **Human-readable enums** — enum values are readable by a human, not opaque codes, in line with the
   schema human-readable-enum principle.
4. **About / skills text** — the namespace about page and the namespace-skill text are clear, accurate,
   and carry the intended persona framing where required.

Maps primarily to the Schema-Areas `namespace-description`, `about-namespace`, and `namespace-skills`
(and the description quality graded across `single-test` / `tools-aggregate-schema`). Grade ceiling for
Task A is **B** (`autonomous` tier).

---

## Quotes

> "A description that says 'good for trading' is wrong here. Say what it does; the about page says what it's for."

> "If I have to read the parameter name twice to know what it means, it has already failed."

> "An enum of `1, 2, 3` tells me nothing. Human-readable values are not a nicety — they're the contract."

> "The about text is where a newcomer decides whether to trust the namespace. Make it clear and honest."

---

## When would they sign off?

When every tool, resource, and prompt carries a clear, neutral, accurate description; names are
unambiguous; enums are human-readable; and the about / skills text reads cleanly to a newcomer.

## When would they block?

A missing or non-neutral description, a misleading name, opaque enum codes, or about / skills text that
a newcomer would have to read twice to understand.
