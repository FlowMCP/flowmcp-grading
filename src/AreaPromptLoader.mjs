import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PromptBuilder } from './PromptBuilder.mjs'


// Resolve the package-local prompts/ tree from this module's location, so a
// consumer (the CLI) does not have to guess the installed package path. The
// prompts/ tree ships with the package (no package.json#files exclusion).
const MODULE_DIR = dirname( fileURLToPath( import.meta.url ) )
const PACKAGE_PROMPTS_ROOT = resolve( MODULE_DIR, '..', 'prompts' )
// The technical Schema-Personas (the review lenses) ship with this
// package under personas/. The CLI resolves the lens file from here so it does not
// have to guess the installed package path (mirrors getPromptsRoot).
const PACKAGE_PERSONAS_ROOT = resolve( MODULE_DIR, '..', 'personas' )


/**
 * AreaPromptLoader — loads a single grading area's prompt building blocks from
 * the `prompts/` tree and composes ONE evaluator prompt via PromptBuilder.build().
 *
 * This is the production replacement for the throwaway prompt script: it
 * reuses PromptBuilder (no duplicated composition) and is the Area-loader the
 * CLI `--emit-prompts` path wires in. For an area it gathers template,
 * pre-instructions, output-schema, policies, persona requirement and the area's
 * questions, then composes exactly ONE evaluator prompt.
 *
 * Hard rules (binding):
 *   - static methods only, object parameters, object returns
 *   - private-by-default (# prefix) for all helpers
 *   - NO silent defaults — a missing template/schema/file throws a clear error
 *   - NO for/while loops, NO then/catch
 *
 * Error prefix APL-* (AreaPromptLoader):
 *   APL-001 — Required parameter missing
 *   APL-002 — Type mismatch for parameter
 *   APL-003 — Parameter must not be empty
 *   APL-004 — Invalid flow (not 'provider' or 'selection')
 *   APL-005 — Invalid area for the given flow
 *   APL-006 — A required prompt artifact file is missing on disk
 *   APL-007 — questions.json is malformed
 *   APL-008 — No questions defined for the area
 *   APL-009 — Unknown file placeholder (no role mapping)
 *   APL-010 — A NAME token survived substitution (torso — no context value)
 */


// Deterministic NAME-token -> substitution-key map (PRD-3.2). The emit context
// supplies real values; any token that survives without one is an APL-010 torso.
//
// The four persona NAME tokens used by the persona-required Schema-Area
// templates (about-namespace, namespace-skills) and the Selection templates. Previously
// these tokens were absent here, so the persona-required areas could not be
// composed (they deferred). With them mapped, the CLI emit context fills the resolved
// base persona + lens (name + repo-relative file); an unfilled token is still a hard
// APL-010 torso (NO SILENT DEFAULT preserved).
const NAME_TOKEN_TO_KEY = Object.freeze( {
    '{{NAMESPACE}}': 'namespace',
    '{{TOOL_NAME}}': 'toolName',
    '{{SCHEMA_NAME}}': 'schemaName',
    '{{SKILL_NAME}}': 'skillName',
    '{{SELECTION_NAME}}': 'selectionName',
    '{{BASE_PERSONA_NAME}}': 'basePersonaName',
    '{{BASE_PERSONA_FILE}}': 'basePersonaFile',
    '{{LENS_NAME}}': 'lensName',
    '{{LENS_FILE}}': 'lensFile'
} )


// Areas graded in the provider (single-schema) flow — mirrors
// Phases/SingleSchema.mjs PROVIDER_AREAS.
const PROVIDER_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'tools-aggregate-namespace',
    'namespace-description',
    'namespace-skills',
    'about-namespace'
]


// Areas graded in the selection flow that carry questions. `selection-aggregate`
// is intentionally excluded: it has no questions in questions.json (it is the
// predecessor-grade roll-up, driven by grades rather than evaluator questions),
// and PromptBuilder.build() requires a non-empty questions array.
const SELECTION_AREAS = [
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3'
]


// Deterministic placeholder→role map for the per-area filesToRead lists in
// questions.json. NO silent default: an unmapped placeholder throws APL-009.
const FILE_ROLE_BY_PLACEHOLDER = Object.freeze( {
    '{{schemaPath}}': 'Schema definition of the tool (FlowMCP v4.x .mjs file)',
    '{{responseFixturePath}}': 'Last successful test response fixture (JSON)',
    '{{providerDocsPath}}': 'Provider documentation reference',
    '{{namespacePath}}': 'Namespace schema source',
    '{{domainKnowledgePath}}': 'Domain-knowledge document for the namespace',
    '{{aboutPath}}': 'About page of the namespace/selection',
    '{{personaPath}}': 'Persona base file',
    '{{lensPath}}': 'Persona lens file',
    '{{skillPath}}': 'Skill definition file',
    '{{l1SkillsPath}}': 'Level-1 skills reference',
    '{{l2SkillsPath}}': 'Level-2 skills reference'
} )


class AreaPromptLoader {
    static getPromptsRoot() {
        const promptsRoot = PACKAGE_PROMPTS_ROOT

        return { promptsRoot }
    }


    // Package-local personas/ root (the technical Schema-Persona lenses).
    // The CLI resolves the lens file (e.g. documentation-dx-reviewer.md) from here.
    static getPersonasRoot() {
        const personasRoot = PACKAGE_PERSONAS_ROOT

        return { personasRoot }
    }


    static getAreasForFlow( { flow } ) {
        const { status, messages } = AreaPromptLoader.#validationFlow( { flow } )
        if( status === false ) { throw new Error( `AreaPromptLoader.getAreasForFlow: ${messages.join( '; ' )}` ) }

        const areas = flow === 'provider'
            ? PROVIDER_AREAS.slice()
            : SELECTION_AREAS.slice()

        return { areas }
    }


    static async loadArea( { promptsRoot, area, persona, goal, substitutions = null } ) {
        const { status, messages } = AreaPromptLoader.#validationLoadArea( { promptsRoot, area } )
        if( status === false ) { throw new Error( `AreaPromptLoader.loadArea: ${messages.join( '; ' )}` ) }

        const template = await AreaPromptLoader.#readArtifact( { promptsRoot, 'relPath': join( 'templates', `${area}.md` ), 'label': 'template' } )
        const outputSchema = await AreaPromptLoader.#readOutputSchema( { promptsRoot, area } )
        const questions = await AreaPromptLoader.#loadQuestions( { promptsRoot, area } )
        // PRD-3.2: when a substitution context is supplied (the emit path), file
        // placeholders are replaced with the REAL on-disk paths; without it (the
        // legacy compose path) the placeholder is kept verbatim.
        const files = AreaPromptLoader.#deriveFiles( { questions, substitutions } )
        const policies = await AreaPromptLoader.#loadPolicies( { promptsRoot, area } )

        const built = PromptBuilder.build( {
            template,
            persona,
            files,
            questions,
            outputSchema,
            policies,
            area,
            goal
        } )

        // PRD-3.2: replace the NAME tokens ({{NAMESPACE}}/{{TOOL_NAME}}/...) with the
        // real values from the substitution context. NO SILENT DEFAULT — a name token
        // that survives without a substitution value is a hard APL-010 error (no
        // torso reaches a subagent). Skipped entirely when no context is supplied.
        const prompt = substitutions === null
            ? built.prompt
            : AreaPromptLoader.#applyNameSubstitutions( { prompt: built.prompt, substitutions, area } )

        return { area, prompt, metadata: built.metadata, 'questionCount': questions.length, 'personaRequired': built.metadata.personaRequired }
    }


    static async loadAllAreas( { promptsRoot, flow, persona, personaAreas = null, goal, substitutions = null } ) {
        const { areas } = AreaPromptLoader.getAreasForFlow( { flow } )

        const loaded = await areas
            .reduce( ( promise, area ) => promise.then( async ( acc ) => {
                const result = await AreaPromptLoader.#loadAreaOrDefer( { promptsRoot, area, persona, personaAreas, goal, substitutions } )

                return acc.concat( [ result ] )
            } ), Promise.resolve( [] ) )

        return { 'areas': loaded }
    }


    static async #loadAreaOrDefer( { promptsRoot, area, persona, personaAreas = null, goal, substitutions = null } ) {
        const { personaRequired } = PromptBuilder.isPersonaRequired( { area } )

        // Persona-required area without a resolved persona: do NOT invent one
        // (no silent default). The harness resolves the domain/selection persona
        // at scoring time and composes this area then. We surface the area as a
        // deferred entry so nothing is silently dropped from areas[].
        if( personaRequired === true && ( persona === undefined || persona === null ) ) {
            return {
                area,
                'prompt': null,
                'personaRequired': true,
                'deferred': true,
                'reason': 'persona-required area — harness must compose with the resolved persona (AreaPromptLoader.loadArea)'
            }
        }

        // Composition-time applicability gate. When the caller supplies a
        // persona-area allow-list (the CLI emit path), a persona-required area NOT on
        // the list stays deferred even though a persona is available. This is how
        // namespace-skills is skipped for namespaces that carry no skills (its
        // {{SKILL_NAME}} token would otherwise be a torso), while about-namespace
        // composes corpus-wide. A null list keeps every persona-required area composed.
        if( personaRequired === true && personaAreas !== null && personaAreas.includes( area ) === false ) {
            return {
                area,
                'prompt': null,
                'personaRequired': true,
                'deferred': true,
                'reason': `persona-required area '${area}' not applicable for this target (not in personaAreas allow-list)`
            }
        }

        const personaForArea = AreaPromptLoader.#personaForArea( { area, persona } )
        const result = await AreaPromptLoader.loadArea( { promptsRoot, area, 'persona': personaForArea, goal, substitutions } )
        const { prompt, metadata, questionCount } = result

        return { area, prompt, metadata, questionCount, 'personaRequired': result.personaRequired, 'deferred': false }
    }


    static #personaForArea( { area, persona } ) {
        const { personaRequired } = PromptBuilder.isPersonaRequired( { area } )
        if( personaRequired === false ) { return undefined }

        return persona
    }


    static async #readArtifact( { promptsRoot, relPath, label } ) {
        const fullPath = join( promptsRoot, relPath )
        if( existsSync( fullPath ) === false ) {
            throw new Error( `AreaPromptLoader: APL-006: required ${label} file is missing: ${fullPath}` )
        }
        const content = await readFile( fullPath, 'utf-8' )
        if( typeof content !== 'string' || content === '' ) {
            throw new Error( `AreaPromptLoader: APL-003: ${label} file is empty: ${fullPath}` )
        }

        return content
    }


    static async #readOutputSchema( { promptsRoot, area } ) {
        const fullPath = join( promptsRoot, 'output-schemas', `${area}.schema.json` )
        if( existsSync( fullPath ) === false ) {
            throw new Error( `AreaPromptLoader: APL-006: required output-schema file is missing: ${fullPath}` )
        }
        const raw = await readFile( fullPath, 'utf-8' )
        const outputSchema = JSON.parse( raw )

        return outputSchema
    }


    static async #loadQuestions( { promptsRoot, area } ) {
        const fullPath = join( promptsRoot, 'generated', 'questions.json' )
        if( existsSync( fullPath ) === false ) {
            throw new Error( `AreaPromptLoader: APL-006: required questions.json is missing: ${fullPath}` )
        }
        const raw = await readFile( fullPath, 'utf-8' )
        const parsed = JSON.parse( raw )
        if( Array.isArray( parsed.questions ) === false ) {
            throw new Error( `AreaPromptLoader: APL-007: questions.json has no questions[] array: ${fullPath}` )
        }

        const questions = parsed.questions
            .filter( ( entry ) => entry.area === area )
            .map( ( entry ) => ( { 'id': entry.id, 'question': entry.question, 'filesToRead': entry.filesToRead } ) )

        if( questions.length === 0 ) {
            throw new Error( `AreaPromptLoader: APL-008: no questions defined for area '${area}' in ${fullPath}` )
        }

        return questions
    }


    static #deriveFiles( { questions, substitutions = null } ) {
        const seen = new Set()
        const files = []

        questions
            .forEach( ( entry ) => {
                const list = Array.isArray( entry.filesToRead ) ? entry.filesToRead : []
                list
                    .forEach( ( placeholder ) => {
                        if( seen.has( placeholder ) === true ) { return }
                        seen.add( placeholder )
                        const role = FILE_ROLE_BY_PLACEHOLDER[ placeholder ]
                        if( role === undefined ) {
                            throw new Error( `AreaPromptLoader: APL-009: unknown file placeholder '${placeholder}' — add a role mapping` )
                        }
                        // PRD-3.2: substitute the placeholder with the REAL on-disk path
                        // when a context supplies it; otherwise keep the placeholder
                        // (legacy compose path). The key is the placeholder stripped of
                        // its braces (e.g. {{schemaPath}} -> schemaPath).
                        const path = AreaPromptLoader.#resolveFilePath( { placeholder, substitutions } )
                        files.push( { path, role } )
                    } )
            } )

        if( files.length === 0 ) {
            throw new Error( 'AreaPromptLoader: APL-003: derived files list is empty — every area must declare filesToRead' )
        }

        return files
    }


    // #resolveFilePath (PRD-3.2) — map a {{placeholder}} file token to its real path
    // from the substitution context. Without a context, or without a value for the
    // key, the placeholder is kept verbatim (legacy compose path). Pure.
    static #resolveFilePath( { placeholder, substitutions } ) {
        if( substitutions === null || typeof substitutions !== 'object' ) { return placeholder }
        const key = placeholder.replace( /^\{\{/, '' ).replace( /\}\}$/, '' )
        const value = substitutions[ key ]
        return typeof value === 'string' && value.length > 0 ? value : placeholder
    }


    // #applyNameSubstitutions (PRD-3.2) — replace the inline NAME tokens with their
    // real values from the substitution context. After replacement NO known NAME
    // token may survive (a torso reaching a subagent is a hard APL-010 error — NO
    // SILENT DEFAULT). Only the tokens actually present in the prompt are required.
    static #applyNameSubstitutions( { prompt, substitutions, area } ) {
        const tokenToKey = NAME_TOKEN_TO_KEY
        const filled = Object.keys( tokenToKey )
            .reduce( ( acc, token ) => {
                const key = tokenToKey[ token ]
                const value = substitutions[ key ]
                if( acc.includes( token ) === false ) { return acc }
                if( typeof value !== 'string' || value.length === 0 ) { return acc }
                return acc.split( token ).join( value )
            }, prompt )

        const unresolved = Object.keys( tokenToKey )
            .filter( ( token ) => filled.includes( token ) === true )
        if( unresolved.length > 0 ) {
            throw new Error( `AreaPromptLoader: APL-010: unresolved name token(s) for area '${area}': ${unresolved.join( ', ' )} — supply them in the substitution context` )
        }

        return filled
    }


    static async #loadPolicies( { promptsRoot, area } ) {
        const policiesDir = join( promptsRoot, 'policies' )
        if( existsSync( policiesDir ) === false ) {
            throw new Error( `AreaPromptLoader: APL-006: required policies directory is missing: ${policiesDir}` )
        }
        const entries = await readdir( policiesDir, { 'withFileTypes': true } )
        const policyFiles = entries
            .filter( ( entry ) => entry.isFile() === true && entry.name.endsWith( '.md' ) === true && entry.name !== 'README.md' )
            .map( ( entry ) => entry.name )
            .sort()

        const parsed = await policyFiles
            .reduce( ( promise, name ) => promise.then( async ( acc ) => {
                const policy = await AreaPromptLoader.#parsePolicy( { 'fullPath': join( policiesDir, name ) } )

                return acc.concat( [ policy ] )
            } ), Promise.resolve( [] ) )

        const policies = parsed
            .filter( ( policy ) => AreaPromptLoader.#policyAppliesToArea( { policy, area } ) === true )
            .map( ( policy ) => ( { 'id': policy.id, 'summary': policy.summary } ) )

        return policies
    }


    static async #parsePolicy( { fullPath } ) {
        const raw = await readFile( fullPath, 'utf-8' )
        const idMatch = raw.match( /policyId:\s*(.+)/ )
        const appliesMatch = raw.match( /appliesTo:\s*(.+)/ )
        if( idMatch === null || appliesMatch === null ) {
            throw new Error( `AreaPromptLoader: APL-003: policy file missing policyId/appliesTo frontmatter: ${fullPath}` )
        }
        const ruleMatch = raw.match( /##\s+Rule\s*\n+([^\n]+)/ )
        const summary = ruleMatch === null
            ? idMatch[ 1 ].trim()
            : ruleMatch[ 1 ].trim()

        return { 'id': idMatch[ 1 ].trim(), 'appliesTo': appliesMatch[ 1 ].trim(), summary }
    }


    static #policyAppliesToArea( { policy, area } ) {
        if( policy.appliesTo.startsWith( 'all' ) === true ) { return true }

        // Conditional policies (e.g. http-400-not-pass) bind only to areas that
        // can execute tools or inspect response status.
        const toolExecutableAreas = [ 'single-test', 'tools-aggregate-schema', 'tools-aggregate-namespace' ]

        return toolExecutableAreas.includes( area )
    }


    static #validationFlow( { flow } ) {
        const messages = []
        const struct = { 'status': false, messages }

        if( flow === undefined || flow === null ) {
            messages.push( 'APL-001: Missing required parameter: flow' )
            return struct
        }
        if( typeof flow !== 'string' ) {
            messages.push( `APL-002: Parameter 'flow' must be of type string, got ${typeof flow}` )
            return struct
        }
        if( flow !== 'provider' && flow !== 'selection' ) {
            messages.push( `APL-004: Invalid flow: ${flow}. Allowed: provider, selection` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationLoadArea( { promptsRoot, area } ) {
        const messages = []
        const struct = { 'status': false, messages }

        const pairs = [
            [ 'promptsRoot', promptsRoot ],
            [ 'area', area ]
        ]
        pairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `APL-001: Missing required parameter: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `APL-002: Parameter '${key}' must be of type string, got ${typeof value}` )
                    return
                }
                if( value === '' ) {
                    messages.push( `APL-003: Parameter '${key}' must not be empty` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        const known = [ ...PROVIDER_AREAS, ...SELECTION_AREAS ]
        if( known.includes( area ) === false ) {
            messages.push( `APL-005: Invalid area for emit: ${area}. Allowed: ${known.join( ', ' )}` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { AreaPromptLoader, PROVIDER_AREAS, SELECTION_AREAS }
