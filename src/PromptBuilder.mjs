/**
 * PromptBuilder — code-only prompt composer for the Generator-Evaluator loop.
 *
 * Per the grading spec:
 *   - Pre-instructions and persona application are named concepts.
 *   - In the architecture, the builder is a code-only node.
 *   - The builder is the prompt-composition building block and makes NO LLM call.
 *   - The persona-application table covers 10 areas (4 neutral, 6 with persona).
 *   - The pre-instructions block is a mandatory verbatim file-preparation block.
 *   - The output schema has a defined location and is marked as binding.
 *
 * Hard rules (binding):
 *   - static methods only, object parameters, object returns
 *   - private-by-default (# prefix) for all helpers
 *   - NO silent defaults — every required parameter validated explicitly
 *   - NO LLM call (no fetch / no http / no anthropic / no openai)
 *   - NO for/while loops, NO then/catch
 *
 * Error prefix PB-* (PromptBuilder):
 *   PB-001 — Required parameter missing
 *   PB-002 — Type mismatch for parameter
 *   PB-003 — Parameter must not be empty
 *   PB-004 — Invalid area (not in whitelist)
 *   PB-005 — Persona required for area but not provided
 *   PB-006 — Persona shape invalid (missing id/basePersona/lens)
 */


const VALID_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'namespace-description',
    'tools-aggregate-namespace',
    'about-namespace',
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3',
    'namespace-skills'
]


// Persona-application table per the grading spec — 4 neutral, 6 with persona.
const PERSONA_REQUIRED_BY_AREA = Object.freeze( {
    'single-test': false,
    'tools-aggregate-schema': false,
    'namespace-description': false,
    'tools-aggregate-namespace': false,
    'about-namespace': true,
    'about-selection': true,
    'selection-skills-L1': true,
    'selection-skills-L2': true,
    'selection-skills-L3': true,
    'namespace-skills': true
} )


// Mandatory file-preparation block — wording verbatim, no drift.
const PRE_INSTRUCTION_HEADER = '## File preparation (mandatory — strict order)\n\n'
    + 'Read the following files in this order BEFORE answering any question.\n'
    + 'If a file does not exist or is not readable, respond only\n'
    + 'with { "blocker": "<filepath>", "reason": "<reason>" } and abort.\n'


// Output-schema notice.
const OUTPUT_SCHEMA_HEADER = '## Output schema (binding)\n\n'
    + 'Respond only with JSON matching the following schema. No Markdown,\n'
    + 'no preamble, no trailing comment.\n'


// Template placeholders that the builder replaces.
const PLACEHOLDER_PERSONA = '{{PERSONA_BLOCK}}'
const PLACEHOLDER_PRE_INSTRUCTIONS = '{{PRE_INSTRUCTIONS_BLOCK}}'
const PLACEHOLDER_FILES = '{{FILES_TO_READ_BLOCK}}'
const PLACEHOLDER_POLICIES = '{{POLICIES_BLOCK}}'
const PLACEHOLDER_QUESTIONS = '{{QUESTIONS_BLOCK}}'
const PLACEHOLDER_OUTPUT_SCHEMA = '{{OUTPUT_SCHEMA_BLOCK}}'


class PromptBuilder {
    static build( { template, persona, files, questions, outputSchema, policies, area } ) {
        const { status, messages } = PromptBuilder.#validationBuild( { template, persona, files, questions, outputSchema, policies, area } )
        if( status === false ) { throw new Error( `PromptBuilder.build: ${messages.join( '; ' )}` ) }

        const personaRequired = PromptBuilder.#computePersonaRequired( { area } )
        const personaBlock = PromptBuilder.#buildPersonaBlock( { persona, personaRequired } )
        const preInstructionBlock = PromptBuilder.#buildPreInstructionBlock( { files } )
        const policyBlock = PromptBuilder.#buildPolicyBlock( { policies } )
        const questionBlock = PromptBuilder.#buildQuestionBlock( { questions } )
        const filesBlock = PromptBuilder.#buildFilesBlock( { files } )
        const outputSchemaBlock = PromptBuilder.#buildOutputSchemaBlock( { outputSchema } )

        const prompt = PromptBuilder.#assemble( {
            template,
            preInstructionBlock,
            personaBlock,
            filesBlock,
            policyBlock,
            questionBlock,
            outputSchemaBlock
        } )

        const personaId = personaRequired === true
            ? persona.id
            : 'neutral'

        const metadata = {
            area,
            persona: personaId,
            fileCount: files.length,
            questionCount: questions.length,
            personaRequired
        }

        return { prompt, metadata }
    }


    static getValidAreas() {
        return { areas: VALID_AREAS.slice() }
    }


    static isPersonaRequired( { area } ) {
        const { status, messages } = PromptBuilder.#validationArea( { area } )
        if( status === false ) { throw new Error( `PromptBuilder.isPersonaRequired: ${messages.join( '; ' )}` ) }

        return { personaRequired: PERSONA_REQUIRED_BY_AREA[ area ] }
    }


    static #computePersonaRequired( { area } ) {
        // Whitelist already validated upstream — this helper only does the lookup.
        return PERSONA_REQUIRED_BY_AREA[ area ]
    }


    static #buildPersonaBlock( { persona, personaRequired } ) {
        if( personaRequired === false ) { return '' }

        // personaRequired === true — persona was validated as shape-correct.
        const basePersona = persona.basePersona
        const lens = persona.lens
        const focus = persona.focus === undefined || persona.focus === null
            ? ''
            : `Focus: ${persona.focus}\n`

        const block = `Persona: ${persona.id}\n`
            + `Base-Persona: ${basePersona}\n`
            + `Lens: ${lens}\n`
            + focus

        return block
    }


    static #buildPreInstructionBlock( { files } ) {
        const lines = files
            .map( ( entry, index ) => {
                const position = index + 1
                const path = entry.path
                const role = entry.role
                return `${position}. ${path}  — ${role}`
            } )
            .join( '\n' )

        return `${PRE_INSTRUCTION_HEADER}\n${lines}\n`
    }


    static #buildFilesBlock( { files } ) {
        // Mirrors the pre-instruction block — kept as a separate render so
        // templates with {{FILES_TO_READ_BLOCK}} render the same list without
        // the mandatory header (which already lives in {{PRE_INSTRUCTIONS_BLOCK}}).
        const lines = files
            .map( ( entry, index ) => {
                const position = index + 1
                return `${position}. ${entry.path}  — ${entry.role}`
            } )
            .join( '\n' )

        return lines
    }


    static #buildPolicyBlock( { policies } ) {
        if( policies.length === 0 ) { return '' }

        const lines = policies
            .map( ( entry, index ) => {
                const position = index + 1
                const id = entry.id
                const summary = entry.summary
                return `${position}. ${id} — ${summary}`
            } )
            .join( '\n' )

        return `## Policies (binding)\n\n${lines}\n`
    }


    static #buildQuestionBlock( { questions } ) {
        const lines = questions
            .map( ( entry, index ) => {
                const position = index + 1
                const id = entry.id
                const text = entry.question
                return `${position}. [${id}] ${text}`
            } )
            .join( '\n' )

        return `## Questions\n\n${lines}\n`
    }


    static #buildOutputSchemaBlock( { outputSchema } ) {
        const serialized = JSON.stringify( outputSchema, null, 2 )
        return `${OUTPUT_SCHEMA_HEADER}\n${serialized}\n`
    }


    static #assemble( { template, preInstructionBlock, personaBlock, filesBlock, policyBlock, questionBlock, outputSchemaBlock } ) {
        // Replace template placeholders deterministically. Missing placeholders
        // (e.g. neutral template has no policy slot) simply produce no-op
        // replacements — the underlying template owns its structure.
        const withPre = template.split( PLACEHOLDER_PRE_INSTRUCTIONS ).join( preInstructionBlock )
        const withPersona = withPre.split( PLACEHOLDER_PERSONA ).join( personaBlock )
        const withFiles = withPersona.split( PLACEHOLDER_FILES ).join( filesBlock )
        const withPolicies = withFiles.split( PLACEHOLDER_POLICIES ).join( policyBlock )
        const withQuestions = withPolicies.split( PLACEHOLDER_QUESTIONS ).join( questionBlock )
        const withSchema = withQuestions.split( PLACEHOLDER_OUTPUT_SCHEMA ).join( outputSchemaBlock )

        return withSchema
    }


    static #validationBuild( { template, persona, files, questions, outputSchema, policies, area } ) {
        const messages = []
        const struct = { status: false, messages }

        // Step 1 — existence check (per node-validation skill).
        const pairs = [
            [ 'template', template, 'string', null ],
            [ 'files', files, 'array', null ],
            [ 'questions', questions, 'array', null ],
            [ 'outputSchema', outputSchema, 'object', null ],
            [ 'policies', policies, 'array', null ],
            [ 'area', area, 'string', VALID_AREAS ]
        ]

        pairs
            .forEach( ( [ key, value, type, list ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `PB-001: Missing required parameter: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `PB-002: Parameter '${key}' must be of type string, got ${typeof value}` )
                    return
                }
                if( type === 'array' && !Array.isArray( value ) ) {
                    messages.push( `PB-002: Parameter '${key}' must be of type array, got ${typeof value}` )
                    return
                }
                if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                    messages.push( `PB-002: Parameter '${key}' must be of type object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
                    return
                }
                if( list !== null && !list.includes( value ) ) {
                    messages.push( `PB-004: Invalid area: ${value}. Allowed: ${list.join( ', ' )}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        // Step 2 — detail check (non-empty for string/array required fields).
        if( template === '' ) {
            messages.push( "PB-003: Parameter 'template' must not be empty" )
        }
        if( files.length === 0 ) {
            messages.push( "PB-003: Parameter 'files' must not be empty" )
        }
        if( questions.length === 0 ) {
            messages.push( "PB-003: Parameter 'questions' must not be empty" )
        }

        if( messages.length > 0 ) { return struct }

        // Step 3 — per-entry shape check for files (path + role).
        files
            .forEach( ( entry, index ) => {
                if( entry === undefined || entry === null || typeof entry !== 'object' || Array.isArray( entry ) ) {
                    messages.push( `PB-002: Parameter 'files[${index}]' must be of type object` )
                    return
                }
                if( typeof entry.path !== 'string' || entry.path === '' ) {
                    messages.push( `PB-003: Parameter 'files[${index}].path' must be a non-empty string` )
                }
                if( typeof entry.role !== 'string' || entry.role === '' ) {
                    messages.push( `PB-003: Parameter 'files[${index}].role' must be a non-empty string` )
                }
            } )

        // Step 4 — per-entry shape check for questions (id + question).
        questions
            .forEach( ( entry, index ) => {
                if( entry === undefined || entry === null || typeof entry !== 'object' || Array.isArray( entry ) ) {
                    messages.push( `PB-002: Parameter 'questions[${index}]' must be of type object` )
                    return
                }
                if( typeof entry.id !== 'string' || entry.id === '' ) {
                    messages.push( `PB-003: Parameter 'questions[${index}].id' must be a non-empty string` )
                }
                if( typeof entry.question !== 'string' || entry.question === '' ) {
                    messages.push( `PB-003: Parameter 'questions[${index}].question' must be a non-empty string` )
                }
            } )

        // Step 5 — persona consistency check (depends on area whitelist).
        const personaRequired = PERSONA_REQUIRED_BY_AREA[ area ]
        if( personaRequired === true ) {
            if( persona === undefined || persona === null ) {
                messages.push( `PB-005: persona is required for area '${area}'` )
            } else if( typeof persona !== 'object' || Array.isArray( persona ) ) {
                messages.push( `PB-002: Parameter 'persona' must be of type object, got ${Array.isArray( persona ) ? 'array' : typeof persona}` )
            } else {
                const personaPairs = [
                    [ 'id', persona.id ],
                    [ 'basePersona', persona.basePersona ],
                    [ 'lens', persona.lens ]
                ]
                personaPairs
                    .forEach( ( [ key, value ] ) => {
                        if( typeof value !== 'string' || value === '' ) {
                            messages.push( `PB-006: Parameter 'persona.${key}' must be a non-empty string` )
                        }
                    } )
            }
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationArea( { area } ) {
        const messages = []
        const struct = { status: false, messages }

        if( area === undefined || area === null ) {
            messages.push( 'PB-001: Missing required parameter: area' )
            return struct
        }
        if( typeof area !== 'string' ) {
            messages.push( `PB-002: Parameter 'area' must be of type string, got ${typeof area}` )
            return struct
        }
        if( !VALID_AREAS.includes( area ) ) {
            messages.push( `PB-004: Invalid area: ${area}. Allowed: ${VALID_AREAS.join( ', ' )}` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { PromptBuilder, VALID_AREAS, PERSONA_REQUIRED_BY_AREA }
