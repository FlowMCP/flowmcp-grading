/**
 * FlowMCP — MIT License
 *
 * GradingEmit (Memo 152 / PRD-019 F21) — the grading emit-prompt composition
 * (Emit-Skill textbau). Moved VERBATIM from the CLI (flowmcp-cli GradingEmit)
 * because prompt composition is grading-domain. The CLI keeps a thin bridge
 * (gradingRun dispatch + gradingEmitPrompts orchestration) that calls into this
 * class via the grading module surface. Bodies are byte-identical to the former
 * CLI textbau; the only CLI coupling (toRepoRelativePath) is a local pure copy.
 *
 * The `grading` object some methods receive is the flowmcp-grading module surface
 * itself (passed by the CLI bridge) — used to reach AreaPromptLoader etc.
 */

import { join, resolve, basename, dirname, relative, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readdirSync, statSync } from 'node:fs'


class GradingEmit {
    // NOTE (Memo 152 / PRD-019 F21): resolveMaxIterations / resolveMaxTurns stay in
    // the CLI bridge (they parse CLI flags before the grading module is even required,
    // so gradingRun's flag-validation error paths must not depend on this class).
    // Everything below is the grading-domain Emit-Skill textbau.


    // PRD-004 — resolve the --phase flag into a multi-area selector. Three explicit
    // modes, no silent default:
    //   absent          -> { mode: 'default', areas: null } (all applicable)
    //   one token       -> { mode: 'single', areas: [ a ] }
    //   two+ tokens     -> { mode: 'subset', areas: [ a, b, ... ] }
    // Every named token is whitelist-validated against VALID_AREAS (the grading
    // module's canonical area list). An empty member after trim, a duplicate token,
    // or an unknown area is a HARD error (no silent skip, no silent dedupe).
    static resolveAreaSelector( { phase, grading } ) {
        if( phase === null || phase === undefined ) {
            return { 'status': true, 'mode': 'default', 'areas': null, 'error': null }
        }
        if( typeof phase !== 'string' ) {
            return { 'status': false, 'mode': null, 'areas': null, 'error': `Invalid --phase type: expected a comma-separated string, got ${typeof phase}.` }
        }

        const rawTokens = phase.split( ',' )
        const tokens = rawTokens.map( ( t ) => t.trim() )
        const emptyMember = tokens.some( ( t ) => t.length === 0 )
        if( emptyMember === true ) {
            return { 'status': false, 'mode': null, 'areas': null, 'error': `Empty --phase member in "${phase}" (no silent skip; every comma-separated area must be non-empty).` }
        }

        const { areas: validAreas } = grading[ 'PromptBuilder' ].getValidAreas()
        const unknown = tokens.filter( ( t ) => validAreas.includes( t ) === false )
        if( unknown.length > 0 ) {
            return { 'status': false, 'mode': null, 'areas': null, 'error': `Unknown --phase area(s): ${unknown.join( ', ' )} (allowed: ${validAreas.join( ', ' )}).` }
        }

        const seen = []
        const duplicates = []
        tokens
            .forEach( ( t ) => {
                if( seen.includes( t ) === true ) { duplicates.push( t ) }
                else { seen.push( t ) }
            } )
        if( duplicates.length > 0 ) {
            return { 'status': false, 'mode': null, 'areas': null, 'error': `Duplicate --phase area(s): ${duplicates.join( ', ' )} (no silent dedupe; pass each area once).` }
        }

        const mode = tokens.length === 1 ? 'single' : 'subset'
        return { 'status': true, mode, 'areas': tokens, 'error': null }
    }


    // Compose one prompt per grading area via the AreaPromptLoader (Memo 097
    // Kap. 9.0). The loader reuses PromptBuilder.build and resolves the package-
    // local prompts/ tree itself, so the CLI does not guess paths.
    static async composeGradingAreas( { grading, flow, persona = null, personaAreas = null, substitutions = null } ) {
        const AreaPromptLoader = grading[ 'AreaPromptLoader' ]
        if( AreaPromptLoader === undefined || AreaPromptLoader === null ) {
            throw new Error( 'AreaPromptLoader unavailable from flowmcp-grading — update the dependency.' )
        }
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        // PRD-3.2: pass the substitution context so the composed prompts carry real
        // schema paths + tool/namespace names (no torso). A null context keeps the
        // legacy placeholder behaviour (back-compat for callers without schema data).
        // Memo 141: pass the resolved Schema-Persona so the persona-required areas
        // (about-namespace, namespace-skills) are COMPOSED here instead of deferred.
        // A null persona keeps the legacy defer behaviour (Selection/Task-B flow).
        // personaAreas is the composition-time applicability allow-list (about-namespace
        // corpus-wide; namespace-skills only when the namespace carries skills).
        const { areas } = await AreaPromptLoader.loadAllAreas( { promptsRoot, flow, persona, personaAreas, substitutions } )

        return { areas }
    }


    // PRD-3.2 — build the emit substitution context for a provider. Paths are
    // REPO-RELATIVE (git-security: never leak an absolute path into the emitted
    // artifact). The single-test/tools-aggregate areas are bundled across the
    // namespace, so {{TOOL_NAME}} resolves to the joined declared tool list and
    // {{SCHEMA_NAME}} to the schema name (single schema) or the namespace.
    //
    // Memo 141 — the substitution context additionally carries the persona-required
    // Schema-Area inputs: the resolved base persona + lens (name + repo-relative file,
    // filling the four persona NAME tokens and the {{personaPath}}/{{lensPath}} file
    // map) plus the per-namespace {{aboutPath}}, {{namespacePath}}, {{skillPath}} and
    // {{domainKnowledgePath}}. Composition-time applicability (which persona areas
    // actually compose) is the caller's personaAreas allow-list.
    static buildEmitSubstitutions( { cwd, grading, namespace, liveSchemas, pretests } ) {
        const allTools = liveSchemas
            .flatMap( ( s ) => {
                const tools = s.main[ 'tools' ] || s.main[ 'routes' ] || {}
                return Object.keys( tools )
            } )
        const toolName = allTools.length > 0 ? allTools.join( ', ' ) : namespace
        const schemaName = liveSchemas.length === 1 ? liveSchemas[ 0 ].schemaName : namespace
        const firstSchema = liveSchemas[ 0 ]
        const schemaPath = firstSchema !== undefined && typeof firstSchema.sourcePath === 'string'
            ? GradingEmit.toRepoRelativePath( { cwd, 'path': firstSchema.sourcePath } )
            : `providers/${namespace}`
        const firstPretest = pretests.find( ( p ) => typeof p.summaryPath === 'string' )
        const responseFixturePath = firstPretest !== undefined
            ? GradingEmit.toRepoRelativePath( { cwd, 'path': firstPretest.summaryPath } )
            : `providers/${namespace}`

        // Memo 141 — per-namespace persona + resource paths. The namespace source dir
        // is the dirname of the first live schema's sourcePath; the About page lives at
        // <nsDir>/resources/about/<ns>-about.md (Memo 137 convention). domainKnowledge
        // for a namespace-skill review is its About page (the canonical namespace
        // description). The skill ({{SKILL_NAME}}/{{skillPath}}) is the first skill the
        // namespace declares, or empty when it has none (namespace-skills then stays
        // off the personaAreas allow-list, so the token is never a torso).
        const nsDir = firstSchema !== undefined && typeof firstSchema.sourcePath === 'string'
            ? dirname( firstSchema.sourcePath )
            : null
        const aboutPath = nsDir !== null
            ? GradingEmit.toRepoRelativePath( { cwd, 'path': join( nsDir, 'resources', 'about', `${namespace}-about.md` ) } )
            : `providers/${namespace}`
        const skill = GradingEmit.resolveFirstSkill( { nsDir } )
        const persona = GradingEmit.resolveSchemaPersonaPaths( { cwd, grading } )

        return {
            namespace,
            schemaName,
            toolName,
            schemaPath,
            responseFixturePath,
            'namespacePath': schemaPath,
            aboutPath,
            'domainKnowledgePath': aboutPath,
            'skillName': skill.skillName,
            'skillPath': skill.skillPath === '' ? '' : GradingEmit.toRepoRelativePath( { cwd, 'path': skill.skillPath } ),
            'basePersonaName': persona.basePersonaName,
            'basePersonaFile': persona.basePersonaFile,
            'lensName': persona.lensName,
            'lensFile': persona.lensFile,
            'personaPath': persona.basePersonaFile,
            'lensPath': persona.lensFile
        }
    }


    // Memo 141 — the resolved technical Schema-Persona for the persona-required
    // Schema-Areas (about-namespace, namespace-skills): the spec base persona
    // `schema-maintainer` reviewed through the `documentation-dx-reviewer` lens
    // (the about/skills documentation lens). Slug convention `<base>--<lens>`.
    static resolveSchemaPersona() {
        return {
            'id': 'schema-maintainer--documentation-dx-reviewer',
            'basePersona': 'schema-maintainer',
            'lens': 'documentation-dx-reviewer'
        }
    }


    // Memo 141 — resolve repo-relative paths to the base persona + lens files. The
    // lens ships with the grading package (AreaPromptLoader.getPersonasRoot); the base
    // persona is the spec single-source-of-truth in repos/flowmcp-spec/personas. Both
    // are resolved against candidate locations and the first existing one wins; the
    // first candidate is the best-effort fallback (a missing file surfaces as a
    // subagent blocker, never a silent success).
    static resolveSchemaPersonaPaths( { cwd, grading } ) {
        const persona = GradingEmit.resolveSchemaPersona()
        const AreaPromptLoader = grading !== undefined && grading !== null
            ? grading[ 'AreaPromptLoader' ]
            : null
        const packagePersonasRoot = AreaPromptLoader !== null && typeof AreaPromptLoader.getPersonasRoot === 'function'
            ? AreaPromptLoader.getPersonasRoot().personasRoot
            : null

        const lensCandidates = [
            join( cwd, 'repos', 'flowmcp-grading', 'personas', `${persona.lens}.md` ),
            packagePersonasRoot !== null ? join( packagePersonasRoot, `${persona.lens}.md` ) : null
        ]
            .filter( ( p ) => typeof p === 'string' )
        const baseCandidates = [
            join( cwd, 'repos', 'flowmcp-spec', 'personas', `${persona.basePersona}.md` )
        ]

        const lensAbs = lensCandidates.find( ( p ) => existsSync( p ) ) ?? lensCandidates[ 0 ]
        const baseAbs = baseCandidates.find( ( p ) => existsSync( p ) ) ?? baseCandidates[ 0 ]

        return {
            'basePersonaName': persona.basePersona,
            'basePersonaFile': GradingEmit.toRepoRelativePath( { cwd, 'path': baseAbs } ),
            'lensName': persona.lens,
            'lensFile': GradingEmit.toRepoRelativePath( { cwd, 'path': lensAbs } )
        }
    }


    // Memo 141 — find the first skill a namespace declares (<nsDir>/skills/*.mjs).
    // Returns empty strings when the namespace has none; the caller then keeps
    // namespace-skills off the personaAreas allow-list (no {{SKILL_NAME}} torso).
    static resolveFirstSkill( { nsDir } ) {
        if( nsDir === null || existsSync( join( nsDir, 'skills' ) ) === false ) {
            return { 'skillName': '', 'skillPath': '' }
        }
        const skillsDir = join( nsDir, 'skills' )
        const skillFile = readdirSync( skillsDir )
            .filter( ( name ) => name.endsWith( '.mjs' ) === true )
            .sort()
            .find( ( name ) => true )
        if( skillFile === undefined ) {
            return { 'skillName': '', 'skillPath': '' }
        }
        return {
            'skillName': basename( skillFile, '.mjs' ),
            'skillPath': join( nsDir, 'skills', skillFile )
        }
    }


    // Memo 112 — assemble the ONE self-contained Emit-Skill as a numbered, single-
    // authored runbook (Zone 1 harness / Zone 2 numbered tasks / Zone 3 return).
    //
    // The three-zone model (Memo 112 Kap 3): the output contract is explained ONCE
    // in Zone 1 (no per-area duplication of the full schema), the middle is a
    // numbered Ablaufplan that names every schema file explicitly (no CSV tool blob,
    // no "think anew every time"), and Zone 3 carries the Task-ID + consume command.
    //
    // The per-area composed blob (from AreaPromptLoader) is NOT pasted verbatim —
    // it is decomposed into its parts (intro sentence, questions list, area-specific
    // output constraints) and re-rendered numbered. Frontmatter, the empty
    // `## Pre-Instructions` header and the duplicated `## Question(s)`/`## Questions`
    // headers are dropped by reconstruction (Memo 112 M1–M3). The big envelope JSON
    // appears once in Zone 1, not per area (M6).
    static buildEmitSkill( { target, flow, namespace, taskId, emittedAreas, gatedAreas, payloadSkeleton, liveSchemas, pretests, cwd, scopeName = null, runId = null, worklist = null } ) {
        const ready = emittedAreas
            .filter( ( a ) => typeof a.prompt === 'string' && a.prompt.length > 0 )
        const deferred = emittedAreas
            .filter( ( a ) => a.prompt === null || a.prompt === undefined )
            .map( ( a ) => a.area )

        const schemaSteps = GradingEmit.emitSchemaSteps( { liveSchemas, pretests, cwd } )
        const toolSteps = GradingEmit.emitToolSteps( { liveSchemas, pretests, cwd } )
        const schemaGroups = GradingEmit.emitSchemaGroups( { toolSteps, schemaSteps } )
        const singleTestArea = ready.find( ( a ) => GradingEmit.emitAreaUnit( { 'area': a.area } ) === 'tool' )
        // Namespace-level areas only (tool + schema areas are graded INSIDE the per-
        // schema sub-agents, so they are not separate orchestrator steps — F10).
        const namespaceAreas = ready.filter( ( a ) => GradingEmit.emitAreaUnit( { 'area': a.area } ) === 'namespace' )

        // Memo 112 — a schema-scoped emit is a self-contained per-schema sub-skill:
        // the literal prompt one sub-agent gets (no "create tasks" step, returns ONE
        // JSON the orchestrator collects). The namespace emit below is the orchestrator.
        if( scopeName !== null && scopeName !== undefined ) {
            return GradingEmit.buildSchemaSubSkill( { namespace, scopeName, taskId, ready, schemaGroups, singleTestArea } )
        }

        // Memo 112 (REV-05) — the namespace emit is a pure ORCHESTRATOR: it carries NO
        // grading content (questions/contract live ONLY in each per-schema sub-skill).
        // It just tells the main agent to dispatch one sub-agent per schema, each with
        // the schema's own `<namespace>/<schema> --emit-prompts` command as its prompt.
        const header = [
            `# Grading orchestrator — ${namespace}`,
            '',
            'You COORDINATE here — you do NOT grade in this context. Each schema is graded',
            'in its own fresh sub-agent that carries its own complete instructions and',
            'writes its own results. Your job: dispatch them, then finalize.',
            '',
            `- Namespace: \`${namespace}\` · schemas: ${schemaGroups.length} · tools: ${toolSteps.length}`,
            `- Run-ID: \`${runId !== null ? runId : taskId}\` (every sub-agent below shares it — check progress with \`flowmcp grading state ${namespace}\`)`
        ].join( '\n' )

        const runFlag = runId !== null ? runId : taskId
        // Memo 112 P6.3 — dispatch ONLY the worklist (ungraded / stale). A null worklist
        // means "no filter" → dispatch every schema (unchanged behavior). Fresh schemas
        // (graded + schemaHash unchanged) are listed as skipped, not re-graded.
        const dispatchGroups = worklist === null
            ? schemaGroups
            : schemaGroups.filter( ( g ) => worklist.includes( g.schemaName ) === true )
        const skippedGroups = worklist === null
            ? []
            : schemaGroups.filter( ( g ) => worklist.includes( g.schemaName ) === false )
        const dispatchLines = dispatchGroups
            .map( ( g, index ) => `- **Sub-agent ${index + 1}** — schema \`${g.schemaName}\` (${g.tools.length} tool(s)): run \`flowmcp grading non-deterministic ${namespace}/${g.schemaName} --emit-prompts --run ${runFlag}\`, then give that output to a fresh sub-agent as its ENTIRE prompt.` )
            .join( '\n' )
        const skipLine = skippedGroups.length > 0
            ? `\n\n_Skipped (fresh — already graded, schemaHash unchanged): ${skippedGroups.map( ( g ) => `\`${g.schemaName}\`` ).join( ', ' )}._`
            : ''
        const step1 = [
            '## Step 1 — Dispatch one sub-agent per schema (run in parallel)',
            '',
            'For each schema: generate its sub-skill with the command, hand the output to a',
            'fresh sub-agent, and let it grade + write its own results. The per-schema',
            'writes are isolated, so the sub-agents are safe to run in parallel.',
            '',
            dispatchLines.length > 0 ? dispatchLines : '- (no stale/ungraded schemas — nothing to grade this pass)',
            skipLine
        ].join( '\n' )

        const namespaceLines = namespaceAreas
            .map( ( a ) => `- \`${a.area}\`: run \`flowmcp grading non-deterministic ${namespace} --emit-prompts --phase ${a.area}\`, hand it to a fresh sub-agent, grade it once for the namespace.` )
            .join( '\n' )
        const step2 = namespaceAreas.length > 0
            ? [ '', '', '## Step 2 — Namespace-wide areas (after every schema is done)', '', namespaceLines ].join( '\n' )
            : ''

        // Memo 112 P6.4 — the outer loop: poll progress (transient per-run state) until
        // every dispatched schema is scored, re-dispatch any that stalled, then finalize
        // ONCE (persistent namespace rollup + recommendation). maxTurns is the Notausgang.
        const step3 = [
            '',
            '',
            '## Step 3 — Outer loop: wait for completion, then finalize',
            '',
            `Run-ID \`${runFlag}\` ties every sub-agent's progress together. Loop:`,
            '',
            `1. **Poll** \`flowmcp grading state ${namespace}\` → read \`schemaProgress.scored\` / \`.total\`.`,
            '2. **Re-dispatch** any schema still `pending` or failed → re-run its Step-1 command in a fresh sub-agent.',
            '3. **Repeat** 1–2 until `scored == total` (or you hit your maxTurns budget — the Notausgang).',
            `4. **Finalize ONCE** \`flowmcp grading finalize ${namespace}\` → rebuilds the namespace index + grade.json`,
            '   AND prints the recommendation (which schemas remain stale / below target). An empty worklist',
            '   means the namespace is fully graded and fresh — you are done.',
            '',
            'The rollup runs exactly once, never in parallel with the sub-agents.'
        ].join( '\n' )

        const gatedNote = ( Array.isArray( gatedAreas ) ? gatedAreas : [] ).length > 0
            ? [
                '',
                '',
                '## Gated areas (NOT in this pass)',
                '',
                'These stage-2 areas are emitted in a FOLLOW-UP pass once every schema',
                'of the namespace is deterministic-green — do not attempt them now:',
                ...( gatedAreas.map( ( g ) => `- ${typeof g === 'string' ? g : ( g.area === undefined ? JSON.stringify( g ) : `${g.area} (${g.reason === undefined ? 'gated' : g.reason})` )}` ) )
            ].join( '\n' )
            : ''

        const deferredNote = deferred.length > 0
            ? `\n\n## Deferred areas\n\nComposed by the harness with the resolved persona (not in this text): ${deferred.join( ', ' )}.`
            : ''

        return `${header}\n\n${step1}${step2}${step3}${gatedNote}${deferredNote}\n`
    }


    // Memo 112 (REV-05) — the self-contained per-schema sub-skill: the literal prompt
    // ONE sub-agent receives to grade ONE schema. It carries EVERYTHING (minimal
    // contract + questions + ordered per-tool steps + a PRE-FILLED return JSON + the
    // self-consume command), so nothing depends on a shared doc being in context. The
    // burden on the sub-agent is minimal: fill the null scores + one reasoning/tool.
    static buildSchemaSubSkill( { namespace, scopeName, taskId, ready, schemaGroups, singleTestArea } ) {
        const group = schemaGroups.find( ( g ) => g.schemaName === scopeName )
        const tools = group !== undefined ? group.tools : []
        const toolCount = tools.length
        const scoresFile = `${scopeName}.scores.json`
        const toolAreaCount = ready.filter( ( a ) => GradingEmit.emitAreaUnit( { 'area': a.area } ) === 'tool' ).length
        const schemaAreaCount = ready.filter( ( a ) => GradingEmit.emitAreaUnit( { 'area': a.area } ) === 'schema' ).length

        const header = [
            `# Grading sub-skill — schema \`${scopeName}\` (namespace \`${namespace}\`)`,
            '',
            'You are a sub-agent grading ONE schema. Read the file(s), score the areas',
            'below, fill the pre-built JSON, then run the one command. Answer only from',
            'the files you open: no web research, no assumptions.',
            '',
            `- Schema: \`${scopeName}\` (namespace \`${namespace}\`)`,
            `- Task-ID: \`${taskId}\``,
            `- Tools: ${toolCount} · areas: per-tool ${toolAreaCount}, per-schema ${schemaAreaCount}`
        ].join( '\n' )

        const contract = [
            '## How to score (minimal — keep it light)',
            '',
            'Score every question `1`–`5` (or `"n/a"`). Per-tool areas: one `reasoning`',
            'per tool (not per question). Per-schema areas: one `reasoning` for the area.',
            'Fill only the `null` scores and the empty `reasoning` strings in the JSON',
            'below — add no other fields. The CLI fills ids, hashes, timestamps. On a',
            'file-read error reply only with `{ "blocker": "<file>", "reason": "<why>" }`.',
            'JSON only — no Markdown.'
        ].join( '\n' )

        const questionsRef = GradingEmit.emitQuestionsReference( { ready } )

        const open = group !== undefined
            ? `Open \`${group.schemaPath}\` and read its tests (${group.fixtureNote}).`
            : `Read schema \`${scopeName}\` and its tests.`
        const areaStepLines = ready
            .map( ( a ) => {
                const unit = GradingEmit.emitAreaUnit( { 'area': a.area } )
                const qn = GradingEmit.emitAreaParts( { 'prompt': a.prompt } ).questionIds.length
                if( unit === 'tool' ) {
                    const toolList = tools.length > 0
                        ? tools.map( ( toolName, index ) => `  ${index + 1}. \`${toolName}\`` ).join( '\n' )
                        : '  (no tools)'
                    return `- **${a.area}** — answer its ${qn} questions for EACH tool (one result per tool):\n${toolList}`
                }
                return `- **${a.area}** — answer its ${qn} questions ONCE for this schema (one result).`
            } )
            .join( '\n' )
        const steps = [
            `## Grade schema \`${scopeName}\``,
            '',
            open,
            'Then score the areas (questions listed above):',
            '',
            areaStepLines
        ].join( '\n' )

        const skeleton = GradingEmit.buildSchemaReturnSkeleton( { taskId, ready, tools } )
        const returnBlock = [
            '## Fill this JSON, then submit it — and loop until accepted',
            '',
            `Save the filled JSON as \`${scoresFile}\` — replace every \`null\` with a score`,
            'and every empty `reasoning` with one short sentence. Add nothing else.',
            '',
            '```json',
            skeleton,
            '```',
            '',
            'Then submit it (isolated — safe to run in parallel with other schemas):',
            '',
            '```bash',
            `flowmcp grading non-deterministic ${namespace}/${scopeName} --consume-scores ${scoresFile}`,
            '```',
            '',
            '**You are NOT done until this command succeeds (exit 0).** If it reports a',
            'parse error, a Task-ID mismatch or a result-count mismatch, fix the JSON in',
            `\`${scoresFile}\` and run the command again. Repeat until it is accepted —`,
            'only an accepted submission counts as completing this schema.'
        ].join( '\n' )

        return `${header}\n\n${contract}\n\n${questionsRef}\n\n${steps}\n\n${returnBlock}\n`
    }


    // Memo 112 (REV-05) — the PRE-FILLED per-schema return JSON. One results[] per
    // ready area, with the question ids already laid out and `null` scores + empty
    // reasoning for the sub-agent to fill. Per-tool area → one result per tool (with a
    // `tool` key); per-schema area → exactly one result. consume-scores count-checks
    // results[] against the per-area expected count; the inner shape is ours, kept
    // minimal to raise reliability.
    static buildSchemaReturnSkeleton( { taskId, ready, tools } ) {
        const areas = ready
            .map( ( a ) => {
                const questionIds = GradingEmit.emitAreaParts( { 'prompt': a.prompt } ).questionIds
                const unit = GradingEmit.emitAreaUnit( { 'area': a.area } )
                const emptyScores = () => questionIds.reduce( ( acc, qid ) => { acc[ qid ] = null; return acc }, {} )
                const results = unit === 'tool'
                    ? tools.map( ( toolName ) => ( { 'tool': toolName, 'scores': emptyScores(), 'reasoning': '' } ) )
                    : [ { 'scores': emptyScores(), 'reasoning': '' } ]
                return { 'area': a.area, results }
            } )
        const skeleton = { taskId, 'scores': [], areas }

        return JSON.stringify( skeleton, null, 2 )
    }


    // Memo 112 (REV-04) — group the per-tool steps by their declaring schema, so the
    // runbook can be organised as ONE task per schema (schemas run sequentially; the
    // tools inside a schema are the ordered sub-steps). Order follows schemaSteps.
    static emitSchemaGroups( { toolSteps, schemaSteps } ) {
        const tools = Array.isArray( toolSteps ) ? toolSteps : []
        const order = Array.isArray( schemaSteps ) ? schemaSteps : []

        return order
            .map( ( s ) => {
                const groupTools = tools
                    .filter( ( t ) => t.schemaName === s.schemaName )
                    .map( ( t ) => t.toolName )
                return { 'schemaName': s.schemaName, 'schemaPath': s.schemaPath, 'fixtureNote': s.fixtureNote, 'tools': groupTools }
            } )
    }


    // Memo 112 (REV-04) — the questions, listed ONCE as a reference (a set of
    // criteria, keyed by their stable [Q-…] id). Every task points back here instead
    // of repeating the questions per tool/schema.
    static emitQuestionsReference( { ready } ) {
        const blocks = ready
            .map( ( a ) => {
                const parts = GradingEmit.emitAreaParts( { 'prompt': a.prompt } )
                const unit = GradingEmit.emitAreaUnit( { 'area': a.area } )
                const qList = parts.questions
                    .map( ( q ) => `- [${q.id}] ${q.text}` )
                    .join( '\n' )
                const scope = unit === 'tool'
                    ? `asked PER TOOL — one result per tool, ${parts.questions.length} answers each`
                    : ( unit === 'schema'
                        ? `asked ONCE for this schema — ${parts.questions.length} answers`
                        : `asked ONCE for the namespace — ${parts.questions.length} answers` )
                return [ `### ${a.area} — ${scope}`, '', qList ].join( '\n' )
            } )
            .join( '\n\n' )

        return [ '## Questions (read once)', '', blocks ].join( '\n' )
    }


    // Memo 112 (REV-05, F10=per-schema) — area iteration unit. `single-test` is per
    // TOOL (one result per tool); `tools-aggregate-schema` is per SCHEMA (one result
    // per schema — that is how RebuildIndex reads it). Both belong inside the per-
    // schema sub-agent. The remaining neutral areas are namespace-level (stage-2).
    static emitAreaUnit( { area } ) {
        if( area === 'single-test' ) { return 'tool' }
        if( area === 'tools-aggregate-schema' ) { return 'schema' }
        return 'namespace'
    }


    // Memo 112 — build per-tool steps: every declared tool with the schema file that
    // declares it and that schema's fixture-size note. Repo-relative paths only.
    static emitToolSteps( { liveSchemas, pretests, cwd } ) {
        const schemas = Array.isArray( liveSchemas ) ? liveSchemas : []
        const tests = Array.isArray( pretests ) ? pretests : []
        const fixtureBySchema = tests
            .reduce( ( acc, p ) => {
                if( typeof p.summaryPath === 'string' && p.summaryPath.length > 0 ) { acc[ p.schemaName ] = p.summaryPath }
                return acc
            }, {} )

        return schemas
            .flatMap( ( s ) => {
                const toolMap = ( s.main !== undefined && s.main !== null )
                    ? ( s.main[ 'tools' ] || s.main[ 'routes' ] || {} )
                    : {}
                const schemaPath = typeof s.sourcePath === 'string'
                    ? GradingEmit.toRepoRelativePath( { cwd, 'path': s.sourcePath } )
                    : `providers/${s.schemaName}`
                const fixtureNote = GradingEmit.emitFixtureNote( { cwd, 'fixturePath': fixtureBySchema[ s.schemaName ] } )
                return Object.keys( toolMap )
                    .map( ( toolName ) => ( { toolName, 'schemaName': s.schemaName, schemaPath, fixtureNote } ) )
            } )
    }


    // Memo 112 — decompose a composed area blob into its parts using PromptBuilder's
    // constant headers. Strips leading YAML frontmatter (M1), drops the empty
    // `## Pre-Instructions` + duplicated `## Question(s)`/`## Questions` headers
    // (M2/M3), and lifts the per-area question list + question IDs. The full inline
    // output schema (M6) is intentionally NOT carried over — the contract lives once
    // in Zone 1. Pure string work; never throws (falls back to empty parts).
    static emitAreaParts( { prompt } ) {
        const stripped = ( typeof prompt === 'string' ? prompt : '' )
            .replace( /^---\n[\s\S]*?\n---\n/, '' )

        const introMatch = stripped.match( /## Question\(s\)\n+([\s\S]*?)\n+## Questions/ )
        const intro = introMatch !== null ? introMatch[ 1 ].trim() : ''

        const questionsMatch = stripped.match( /## Questions\n+([\s\S]*?)(?:\n+## |$)/ )
        const questionsRaw = questionsMatch !== null ? questionsMatch[ 1 ].trim() : ''

        // Parse each "<n>. [<id>] <text>" line into a structured question so the
        // section can RE-number them inside the area's numbering tree (e.g. 1.2.1)
        // instead of restarting a flat 1..N inside an already-numbered section.
        const questions = questionsRaw
            .split( '\n' )
            .map( ( line ) => line.trim() )
            .filter( ( line ) => line.length > 0 )
            .map( ( line ) => {
                const match = line.match( /^\d+\.\s*\[([A-Za-z0-9-]+)\]\s*(.*)$/ )
                return match !== null ? { 'id': match[ 1 ], 'text': match[ 2 ].trim() } : null
            } )
            .filter( ( entry ) => entry !== null )

        const questionIds = questions.map( ( q ) => q.id )

        return { intro, questions, questionIds }
    }


    // Memo 112 Kap 4/5 — build the explicit per-schema steps with a fixture-size
    // gate (F3 = threshold). Schema paths are repo-relative (git-security). For each
    // schema the test fixture size decides inline-read vs. subagent-read so large
    // fixtures do not pollute the main context; the size is COMPUTED here, per the
    // user's requirement that the generator calculate the KB itself.
    static emitSchemaSteps( { liveSchemas, pretests, cwd } ) {
        const schemas = Array.isArray( liveSchemas ) ? liveSchemas : []
        const tests = Array.isArray( pretests ) ? pretests : []

        const fixtureBySchema = tests
            .reduce( ( acc, p ) => {
                if( typeof p.summaryPath === 'string' && p.summaryPath.length > 0 ) { acc[ p.schemaName ] = p.summaryPath }
                return acc
            }, {} )

        return schemas
            .map( ( s ) => {
                const schemaPath = typeof s.sourcePath === 'string'
                    ? GradingEmit.toRepoRelativePath( { cwd, 'path': s.sourcePath } )
                    : `providers/${s.schemaName}`
                const fixturePath = fixtureBySchema[ s.schemaName ]
                const fixtureNote = GradingEmit.emitFixtureNote( { cwd, fixturePath } )
                return { 'schemaName': s.schemaName, schemaPath, fixtureNote }
            } )
    }


    // Memo 112 — fixture-size gate. Reads the fixture's size on disk and recommends
    // inline reading for small fixtures and a subagent read for large ones (the
    // threshold avoids content-pollution at scale). Missing fixture = read tests
    // from the schema directly.
    static emitFixtureNote( { cwd, fixturePath } ) {
        const INLINE_LIMIT_KB = 16
        if( typeof fixturePath !== 'string' || fixturePath.length === 0 ) {
            return 'no saved fixture — read the schema\'s declared tests directly'
        }
        const relPath = GradingEmit.toRepoRelativePath( { cwd, 'path': fixturePath } )
        const absPath = isAbsolute( fixturePath ) ? fixturePath : join( cwd, fixturePath )
        if( existsSync( absPath ) === false ) {
            return `fixture \`${relPath}\` (not on disk yet — read the schema's declared tests directly)`
        }
        const sizeKb = Math.max( 1, Math.round( statSync( absPath ).size / 1024 ) )
        const mode = sizeKb > INLINE_LIMIT_KB
            ? 'read it in a SUBAGENT to keep this context clean'
            : 'read it inline'
        return `fixture \`${relPath}\`, ~${sizeKb} KB → ${mode}`
    }


    // PRD-005/006/004 — partition composed areas into emitted / skipped / gated.
    // Order: applicability pre-filter (PRD-005) -> dependency+Namespace-Gate
    // (PRD-006) -> caller area selector (PRD-004). NO silent default at any step.
    static async resolveEmittedAreas( { grading, areas, targetDir, schemaDirs, pretests, areaSelector, sourceDirs = [] } ) {
        // --- PRD-005: optional-area applicability pre-filter ---------------------
        const aboutProbe = await GradingEmit.detectAboutResourcePresent( { targetDir, schemaDirs, sourceDirs } )
        const filtered = GradingEmit.filterApplicableAreas( { grading, areas, aboutPresent: aboutProbe.present } )
        if( filtered.status === false ) {
            return { 'status': false, 'error': filtered.error, 'fix': filtered.fix }
        }

        // --- PRD-006: derive levels + evaluate the dependency graph --------------
        const gated = GradingEmit.evaluateAreaGate( { grading, areas: filtered.applicableAreas, pretests, schemaCount: schemaDirs.length, aboutPresent: aboutProbe.present } )
        if( gated.status === false ) {
            return { 'status': false, 'error': gated.error, 'fix': gated.fix }
        }

        // --- PRD-004: apply the resolved area selector ---------------------------
        const selected = GradingEmit.applyAreaSelector( { areas: gated.readyAreas, areaSelector } )

        // Caller-named-but-skipped/gated areas (subset/single) are surfaced so the
        // caller is never silently ignored. Re-collect any selector-named area that
        // landed in skipped/gated for the result note.
        const skippedAreas = filtered.skippedAreas
            .concat( selected.selectorSkippedNote )

        return {
            'status': true,
            'emittedAreas': selected.emittedAreas,
            'skippedAreas': skippedAreas,
            'gatedAreas': gated.gatedAreas
        }
    }


    // PRD-005 — probe whether the About resource exists at the SOURCE level for any
    // schema folder (resources/about/), mirroring the rebuild lookup but at the
    // resource (not _gradings/) level. A probe error returns present:false with a
    // recorded note — never a thrown swallow, never a silent true.
    static async detectAboutResourcePresent( { targetDir, schemaDirs, sourceDirs = [] } ) {
        // The About resource is declared by the schema's `resources.about` and resolves
        // relative to the schema-file directory in schemaFolders[] (live-read, no
        // import). In the flat v4 layout the schema file sits at <ns>/<schema>.mjs, so
        // the about page lives at <ns>/resources/about/ in the SOURCE tree — NOT in the
        // island targetDir. We probe the real source schema-file directories first; the
        // island targetDir (namespace level + <schema> subdir) is kept as an additive
        // fallback for grading-data trees that carry an imported about copy. Present if
        // ANY location exists (no silent default).
        const sourceHit = sourceDirs
            .some( ( dir ) => existsSync( join( dir, 'resources', 'about' ) ) )
        if( sourceHit === true ) {
            return { 'present': true }
        }
        const namespaceLevel = existsSync( join( targetDir, 'resources', 'about' ) )
        if( namespaceLevel === true ) {
            return { 'present': true }
        }
        const checks = await schemaDirs
            .reduce( async ( accPromise, schemaName ) => {
                const acc = await accPromise
                if( acc.present === true ) { return acc }
                const aboutDir = join( targetDir, schemaName, 'resources', 'about' )
                const exists = existsSync( aboutDir )
                return { 'present': exists, 'note': acc.note }
            }, Promise.resolve( { 'present': false, 'note': null } ) )

        return { 'present': checks.present }
    }


    // PRD-005 — partition composed areas into applicable vs skipped. An OPTIONAL
    // area whose precondition is absent is skipped with a closed-set NaReason.
    // The only optional provider area today is `about-namespace`, whose
    // precondition is About-resource presence. The map is explicit (no silent
    // default); the chosen NaReason is validated against the grading closed set so
    // a spec drift surfaces immediately.
    static filterApplicableAreas( { grading, areas, aboutPresent } ) {
        const OPTIONAL_AREA_PRECONDITION = { 'about-namespace': { 'naReason': 'out-of-scope-resource', 'present': aboutPresent } }

        const applicableAreas = []
        const skippedAreas = []
        let failure = null

        areas
            .forEach( ( areaEntry ) => {
                const rule = OPTIONAL_AREA_PRECONDITION[ areaEntry.area ]
                if( rule === undefined ) {
                    applicableAreas.push( areaEntry )
                    return
                }
                if( rule.present === true ) {
                    applicableAreas.push( areaEntry )
                    return
                }
                const valid = grading[ 'NaReason' ].isAllowed( { 'naReason': rule.naReason } )
                if( valid.allowed !== true ) {
                    failure = `NaReason "${rule.naReason}" for skipped area ${areaEntry.area} is not in the grading closed set.`
                    return
                }
                skippedAreas.push( { 'area': areaEntry.area, 'naReason': rule.naReason } )
            } )

        if( failure !== null ) {
            return { 'status': false, 'error': failure, 'fix': 'Align the optional-area NaReason map with the grading NaReason closed set.' }
        }

        return { 'status': true, applicableAreas, skippedAreas }
    }


    // PRD-006 — derive per-schema + namespace levels from the pretest results and
    // evaluate the seeded dependency graph. Namespace areas are gated until ALL
    // schemas reach deterministic-green (the cost guard / Provider-Namespace-Gate).
    // Returns ready vs gated partitions; no hardcoded threshold (read from graph).
    static evaluateAreaGate( { grading, areas, pretests, schemaCount, aboutPresent } ) {
        const loaded = grading[ 'AreaDependencyGraph' ].loadDefaultGraph()
        if( loaded.errors.length > 0 ) {
            return { 'status': false, 'error': `Area dependency graph not loadable: ${loaded.errors.join( '; ' )}`, 'fix': 'Reinstall / update flowmcp-grading (the seeded graph data is missing).' }
        }

        const schemaLevels = pretests
            .map( ( pretest ) => {
                const detGreen = pretest.ok === true
                const derived = grading[ 'RequiredLevel' ].deriveSchemaLevel( {
                    'snapshotPresent': true,
                    'structuralValid': true,
                    'dataPretest': { 'ok': pretest.ok === true },
                    detGreen,
                    'gradingStatus': 'pending'
                } )
                return derived.level
            } )
            .filter( ( level ) => level !== null )

        // No usable schema level (zero schemas / all unresolvable): the namespace
        // cannot reach deterministic-green, so namespace areas stay gated. Use the
        // lowest ladder rung explicitly rather than a silent default.
        const namespaceLevel = schemaLevels.length === schemaCount && schemaLevels.length > 0
            ? grading[ 'RequiredLevel' ].deriveNamespaceLevel( { schemaLevels } ).level
            : 'imported'

        const evaluated = grading[ 'AreaDependencyGraph' ].evaluate( {
            'graph': loaded.graph,
            'derivedLevels': { namespaceLevel, aboutPresent, 'memberLevel': 'imported' }
        } )
        if( evaluated.errors.length > 0 ) {
            return { 'status': false, 'error': `Area gate evaluation failed: ${evaluated.errors.join( '; ' )}`, 'fix': 'Inspect the dependency graph data and derived levels.' }
        }

        const readyAreaNames = evaluated.ready
        const gatedReasonByArea = evaluated.gated
            .reduce( ( acc, g ) => { acc[ g.area ] = g.reason; return acc }, {} )

        const readyAreas = areas.filter( ( a ) => readyAreaNames.includes( a.area ) === true )
        const gatedAreas = areas
            .filter( ( a ) => readyAreaNames.includes( a.area ) === false )
            .map( ( a ) => ( { 'area': a.area, 'reason': gatedReasonByArea[ a.area ] === undefined ? 'dependency not satisfied' : gatedReasonByArea[ a.area ] } ) )

        return { 'status': true, readyAreas, gatedAreas }
    }


    // PRD-004 — apply the resolved area selector to the ready areas. default mode
    // emits all ready; single/subset emit only the named ready areas. A named area
    // that is NOT ready (skipped/gated/unknown-to-flow) is recorded as a note so
    // the caller is not silently ignored.
    static applyAreaSelector( { areas, areaSelector } ) {
        if( areaSelector.mode === 'default' ) {
            return { 'emittedAreas': areas, 'selectorSkippedNote': [] }
        }

        const readyNames = areas.map( ( a ) => a.area )
        const emittedAreas = areas.filter( ( a ) => areaSelector.areas.includes( a.area ) === true )
        const selectorSkippedNote = areaSelector.areas
            .filter( ( name ) => readyNames.includes( name ) === false )
            .map( ( name ) => ( { 'area': name, 'naReason': 'blocked-by-precondition', 'note': 'named in --phase but not currently emittable (skipped or gated)' } ) )

        return { emittedAreas, selectorSkippedNote }
    }


    // PRD-007 — compute the deterministic Task-ID over the emitted area set via the
    // shared TaskId generator (order-independent, 8-hex). An empty emitted set has
    // no Task-ID — surfaced explicitly (no silent empty hash).
    static computeGradingTaskId( { grading, namespace, emittedAreaSet } ) {
        if( emittedAreaSet.length === 0 ) {
            return { 'status': false, 'error': 'No emittable areas after applicability/gate/selector resolution.', 'fix': 'Relax --phase, satisfy the dependency gate (reach deterministic-green), or add the missing optional resource.' }
        }
        const generated = grading[ 'TaskId' ].generate( { 'schemaIdSlug': namespace, 'areas': emittedAreaSet } )
        if( generated.errors.length > 0 ) {
            return { 'status': false, 'error': `Task-ID generation failed: ${generated.errors.join( '; ' )}`, 'fix': 'Ensure every emitted area is a known area.' }
        }
        return { 'status': true, 'taskId': generated.taskId }
    }

    // Memo 152 / PRD-019 (F21) — repo-relative path helper, copied from the CLI
    // (GradingTarget.toRepoRelativePath). Pure: turns an absolute path into a repo-
    // relative or ~-anchored path; a non-absolute or foreign path is returned as-is.
    static toRepoRelativePath( { cwd, path } ) {
        if( typeof path !== 'string' || path.length === 0 ) { return path }
        if( !isAbsolute( path ) ) { return path }

        const rel = relative( cwd, path )
        if( rel.length > 0 && !rel.startsWith( '..' ) && !isAbsolute( rel ) ) {
            return rel
        }

        const home = homedir()
        if( path === home ) { return '~' }
        if( path.startsWith( `${home}/` ) ) {
            return `~/${path.slice( home.length + 1 )}`
        }

        return path
    }
}


export { GradingEmit }
