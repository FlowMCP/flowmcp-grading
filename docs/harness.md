# Grading Harness

A grading run is executed by a **harness** — the runtime that turns a built
evaluator prompt into a validated grading. The harness must be specified for
every grading run, and every grading records which harness produced it
(`harness` field in the output envelope, see `prompts/output-schemas/_master.schema.json`).

## Supported harnesses

| harness | status | how the evaluation is performed |
|---------|--------|---------------------------------|
| `claude-code` | supported (only one currently) | see below |

No other harness is supported yet. A grading whose `harness` is not in this
table is invalid.

## `claude-code` — how the evaluation is performed

The non-deterministic evaluation is performed by spawning a **sub-agent as the
evaluator** through the Claude Code agent mechanism — i.e. an `Agent()` call
(the `Task`/sub-agent tool), **not** an external `claude --print` shell call.

Procedure (driven by the `*-start-grade` skill):

1. Build the evaluator prompt with `PromptBuilder.build(...)` — template +
   filtered questions (one area) + persona (or null) + output-schema reference.
2. **Spawn the evaluator sub-agent via `Agent()`**:
   - fresh, **empty context** (no conversation history),
   - **read-only** tools (the sub-agent reads the schema files it is told to read),
   - single evaluation pass,
   - the prompt instructs **strict-JSON only** (no prose, no markdown fences).
3. Parse the sub-agent's final message as JSON and **validate** it against the
   area output-schema (`prompts/output-schemas/<area>.schema.json`,
   resolving `_master.schema.json`). On a parse or schema failure, treat it as a
   `blocker`.
4. The orchestrator wraps the validated answers in the envelope and sets
   `harness: "claude-code"` (plus `gradingId`, `schemaHash`, `timestamp`, ...).

Deterministic questions are answered by code (the deterministic checks), not by
the sub-agent; the two answer sets are merged into the full area grading.

> Harness-agnostic note: conceptually the evaluator is "a single-turn,
> read-only, strict-JSON evaluator call". In the `claude-code` harness that
> concept is realized as an `Agent()` sub-agent. Earlier skill drafts described
> it as a `claude --print --output-format json` CLI call — that was the
> abstract/legacy form; the binding mechanism in this harness is `Agent()`.
