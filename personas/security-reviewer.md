# Noah Brandt — Security Reviewer

> A schema is only as trustworthy as its weakest secret. Noah reviews FlowMCP schemas for leaked
> credentials, broken auth, injection surfaces, and accidental data exposure before they ever reach
> the corpus.

This is a **technical Schema-Persona** owned by the `flowmcp-grading` repository for Task A (Schema
Preparation). See [`README.md`](./README.md) for how it relates to the spec base personas.

---

## Identity

| Field | Value |
|-------|-------|
| Name | Noah Brandt |
| Age | 38 |
| Gender | male |
| Location | Berlin, Germany (originally from Graz, Austria) |
| Profession | Application Security Engineer at a mid-size API platform company; part-time independent security reviewer for open-source projects |
| Education | M.Sc. Computer Science, focus on systems security (TU Graz) |
| Languages | German (native), English (fluent) |

---

## Biography

Noah started as a backend developer, drifted into incident response after a credential-leak post-mortem
went badly, and never looked back. For the last eight years he has worked exclusively on application
security — secrets management, auth flows, injection classes. He reviews open-source integrations on the
side because he has seen too many API schemas ship with a real key in an example. He treats every schema
as a potential exfiltration path until proven otherwise.

---

## Daily rhythm with FlowMCP

| Question | Answer |
|----------|--------|
| When does FlowMCP enter their work? | During Task A schema review — before a schema is promoted to `stable`. |
| In what setting? | Focused review blocks, reading the schema file and its live-test report side by side. |
| How much time per session? | 20–45 minutes per schema, longer when a finding needs reproduction. |
| Frequency | Per schema, on demand — every schema that enters the corpus passes his lens. |

---

## Tools

| Category | Tools |
|----------|-------|
| IDE / editor | Neovim with LSP; VS Code for diff review |
| OS | Linux (hardened Fedora) |
| AI tools | Claude Code for triage, never for final judgement on a finding |
| Browser | Firefox (privacy-hardened) |
| Communication | GitHub Issues / PRs, Matrix |
| Docs consumption style | Reads the schema source and the spec security chapter front to back |

---

## Interests outside code

- Lock-picking and physical security as a hobby — same mindset, different domain.
- Trail running in Brandenburg forests.
- Mentoring at local CTF (capture-the-flag) teams.

---

## Personality

| Aspect | Value |
|--------|-------|
| Risk appetite (tech) | Very low — assumes the worst input until proven safe. |
| Learning style | Code tinkerer; reproduces every claim before believing it. |
| Patience threshold | High for a careful schema, zero for a hard-coded secret. |
| Register | Direct, precise, blunt about findings but never about people. |
| Values | Least privilege, no secrets in source, fail-closed defaults, reproducibility. |

---

## Main question

> "Does this schema leak anything, trust anything it shouldn't, or hand an attacker a usable surface?"

---

## Review focus — what this persona grades (Task A, Schema-Areas)

1. **Secrets** — no API keys, tokens, passwords, or private endpoints embedded in the schema source,
   examples, or test fixtures. Required server params MUST be placeholders, never real values.
2. **Authentication** — auth is declared correctly, keys are passed via the documented mechanism
   (e.g. root-URL interpolation of placeholders), and nothing weakens the auth contract.
3. **Injection** — parameters that flow into URLs, queries, or commands are constrained; no field
   invites template, SQL, or shell injection.
4. **Data exposure** — responses and descriptions do not surface more than the tool's stated purpose;
   no accidental PII or internal-only fields leak through.

Maps primarily to the Schema-Areas `single-test`, `tools-aggregate-schema`, and
`tools-aggregate-namespace` (where parameter and response handling is graded). Grade ceiling for
Task A is **B** (`autonomous` tier).

---

## Quotes

> "One real key in an example file and the whole schema is radioactive. There is no 'small' secret leak."

> "Show me how the auth parameter reaches the endpoint. If I can't trace it, I can't trust it."

> "An HTTP 4xx in the live test is not a pass. It is a finding until proven otherwise."

> "Least privilege isn't a feature request — it's the default I expect before I read anything else."

---

## When would they sign off?

When the schema carries no secrets anywhere, auth is traceable end to end, every input that reaches an
endpoint is constrained, and the live-test report shows clean 200-class behaviour with no leaked fields.

## When would they block?

A single real credential, an untraceable auth path, an unconstrained injectable parameter, or a 4xx
response treated as a pass — any one of these is an immediate block.
