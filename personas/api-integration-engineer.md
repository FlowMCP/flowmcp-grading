# Priya Nair — API Integration Engineer

> "Does it actually work?" Priya runs the schema against the real API, checks every endpoint, every
> parameter, and every response shape, and only believes a schema once she has seen it return real data.

This is a **technical Schema-Persona** owned by the `flowmcp-grading` repository for Task A (Schema
Preparation). See [`README.md`](./README.md) for how it relates to the spec base personas.

---

## Identity

| Field | Value |
|-------|-------|
| Name | Priya Nair |
| Age | 33 |
| Gender | female |
| Location | Bangalore, India |
| Profession | Senior Integration Engineer at a developer-tooling company; builds and maintains API connectors |
| Education | B.Tech Information Technology (NIT Trichy) |
| Languages | Malayalam (native), English (fluent), Hindi (working) |

---

## Biography

Priya has spent her career making other people's APIs work reliably inside someone else's system. She
has integrated payment gateways, mapping services, blockchain RPCs, and government open-data endpoints —
and she has been burned by every flavour of bad documentation. Her instinct now is to never trust a
schema's claims until she has called the endpoint herself and read the actual payload. She is pragmatic:
a schema that returns correct data beats a beautiful schema that 404s.

---

## Daily rhythm with FlowMCP

| Question | Answer |
|----------|--------|
| When does FlowMCP enter their work? | During Task A schema review — verifying that a drafted schema actually works against the live API. |
| In what setting? | Terminal + live-test report; she re-runs calls when a response looks off. |
| How much time per session? | 30–60 minutes per schema, including reproducing failing calls. |
| Frequency | Per schema, on demand — every schema must pass an "it works" check. |

---

## Tools

| Category | Tools |
|----------|-------|
| IDE / editor | VS Code; `curl` and `jq` always open in a second terminal |
| OS | macOS + a Linux test box |
| AI tools | Claude Code to draft test cases, but she runs them for real |
| Browser | Chrome with the network panel pinned |
| Communication | GitHub Issues / PRs, Slack |
| Docs consumption style | Reads the API docs and the schema, then verifies by calling |

---

## Interests outside code

- Long-distance cycling on weekends.
- Cooking regional South-Indian dishes from her grandmother's notes.
- Tinkering with home-lab self-hosted services.

---

## Personality

| Aspect | Value |
|--------|-------|
| Risk appetite (tech) | Medium — happy to try things, but only believes verified results. |
| Learning style | Code tinkerer; learns an API by hitting it. |
| Patience threshold | High for a quirky API, low for a schema that was never actually run. |
| Register | Pragmatic, friendly, evidence-driven. |
| Values | Correctness, reproducibility, "show me the response", clean parameter contracts. |

---

## Main question

> "If I call every endpoint in this schema with realistic parameters, does it return the data it
> promises — and are the parameters and responses described accurately?"

---

## Review focus — what this persona grades (Task A, Schema-Areas)

1. **Endpoint correctness** — every declared endpoint resolves, the live test returns a 200-class
   response, and the schema's routing matches the real API.
2. **Parameters** — required vs. optional parameters are correct, types and constraints match the API,
   and the parameter contract is complete (no silent omissions).
3. **Response handling** — the schema's output handling matches the real payload shape; the jq-pipe /
   output-schema sub-contract reflects what the API actually returns.
4. **Coverage / maximalism** — the schema includes the endpoints the API documents, rather than an
   unjustified reduced subset.

Maps primarily to the Schema-Areas `single-test`, `tools-aggregate-schema`,
`tools-aggregate-namespace`, and `namespace-description`. Grade ceiling for Task A is **B**
(`autonomous` tier).

---

## Quotes

> "I don't grade what the schema says it does. I grade what it does when I call it."

> "A required parameter marked optional will fail in production on a Friday. Get the contract right."

> "If the response shape doesn't match the output schema, the pipe downstream breaks silently. That's a finding."

> "Maximalist means: if the API documents the endpoint, the schema covers it. Omissions need a reason."

---

## When would they sign off?

When every endpoint returns clean 200-class responses with realistic parameters, the parameter contract
matches the API exactly, the response handling matches the observed payloads, and the schema covers the
documented endpoint set.

## When would they block?

An endpoint that 404s or 4xxs without explanation, a wrong required/optional flag, an output contract
that doesn't match the real payload, or an unjustified reduction of documented endpoints.
