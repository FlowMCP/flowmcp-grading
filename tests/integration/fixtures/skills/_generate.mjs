// Deterministic fixture generator for tests/integration/skills.test.mjs
// Run once to (re)generate prompt-artifact.txt, mock-response-pass.json,
// mock-response-blocker.json, mock-response-http-4xx.json per area.
//
// Usage:  node tests/integration/fixtures/skills/_generate.mjs
//
// Persona application per area; blocker pattern; output schema;
// HTTP 4xx is never PASS.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname( fileURLToPath( import.meta.url ) )

const AREAS = [
    { area: 'single-test',                personaRequired: false, answerCount: 10 },
    { area: 'tools-aggregate-schema',     personaRequired: false, answerCount: 6 },
    { area: 'namespace-description',      personaRequired: false, answerCount: 4 },
    { area: 'tools-aggregate-namespace',  personaRequired: false, answerCount: 5 },
    { area: 'about-namespace',            personaRequired: true,  answerCount: 7 },
    { area: 'about-selection',            personaRequired: true,  answerCount: 7 },
    { area: 'selection-skills-L1',        personaRequired: true,  answerCount: 4 },
    { area: 'selection-skills-L2',        personaRequired: true,  answerCount: 5 },
    { area: 'selection-skills-L3',        personaRequired: true,  answerCount: 6 },
    { area: 'namespace-skills',           personaRequired: true,  answerCount: 6 },
    { area: 'selection-aggregate',        personaRequired: true,  answerCount: 6, aggregate: true }
]

const FIXED_SCHEMA_HASH = 'a1b2c3d4'
const FIXED_GRADING_ID = `${ FIXED_SCHEMA_HASH }--2026-05-30T12-00-00Z`
const FIXED_TIMESTAMP = '2026-05-30T12:00:00.000Z'

const NUM_PAD = ( n ) => String( n ).padStart( 2, '0' )

const buildPersona = () => ( {
    basePersonaId: 'decision-maker',
    lensId: 'crypto-trader'
} )

const buildPromptArtifact = ( { area, personaRequired } ) => {
    const lines = []
    lines.push( '## File preparation (mandatory — strict order)' )
    lines.push( '' )
    lines.push( 'Read the following files in this order BEFORE answering any question.' )
    lines.push( 'If a file does not exist or is not readable, respond exclusively' )
    lines.push( 'with { "blocker": "<filepath>", "reason": "<reason>" } and abort.' )
    lines.push( '' )
    lines.push( `1. /tmp/${ area }/source.md  — source artifact for ${ area }` )

    if( personaRequired === true ) {
        lines.push( '' )
        lines.push( '## PERSONA: decision-maker--crypto-trader' )
        lines.push( '[Lens: crypto-trader, Base: decision-maker]' )
    }

    lines.push( '' )
    lines.push( `## Questions (Area: ${ area })` )
    lines.push( '' )
    lines.push( '1. First eval question of the area.' )
    lines.push( '2. Second eval question of the area.' )
    lines.push( '' )
    lines.push( `## Output schema: prompts/output-schemas/${ area }.schema.json` )
    return lines.join( '\n' ) + '\n'
}

const buildAnswerPass = ( { area, index } ) => ( {
    questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
    score: 4.5,
    reasoning: `Mock pass answer for ${ area } question ${ index + 1 }.`,
    evidence: `/tmp/${ area }/source.md:1`
} )

// The selection-aggregate area MUST merge deterministic (categorical) answers
// with non-deterministic (numeric) judgment answers — a deterministic-only
// result is not a valid grading (spec Area 24 §3.2). The first and last
// answers (thresholds + cascade-stop) are deterministic; the middle four are
// numeric judgments.
const buildAnswerAggregatePass = ( { area, index, answerCount } ) => {
    const isDeterministic = index === 0 || index === answerCount - 1
    if( isDeterministic === true ) {
        return {
            questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
            score: 'pass',
            reasoning: `Deterministic selection-wide check ${ index + 1 } passes (threshold / cascade-stop).`,
            evidence: { memberCount: 8, softThreshold: 5, hardThreshold: 7 }
        }
    }
    return {
        questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
        score: 4.5,
        reasoning: `Non-deterministic judgment ${ index + 1 } (coherence / conformance / persona fit / tier).`,
        evidence: `/tmp/${ area }/source.md:1`
    }
}

const buildResponsePass = ( { area, personaRequired, answerCount, aggregate } ) => {
    const answers = Array
        .from( { length: answerCount } )
        .map( ( _, i ) => aggregate === true
            ? buildAnswerAggregatePass( { area, index: i, answerCount } )
            : buildAnswerPass( { area, index: i } ) )
    const persona = personaRequired === true
        ? buildPersona()
        : null
    return {
        gradingId: FIXED_GRADING_ID,
        schemaHash: FIXED_SCHEMA_HASH,
        area,
        iteration: 1,
        timestamp: FIXED_TIMESTAMP,
        persona,
        harness: 'claude-code',
        answers,
        improvementHints: []
    }
}

const buildResponseBlocker = ( { area } ) => ( {
    blocker: `/tmp/${ area }/missing.md`,
    reason: 'ENOENT — file does not exist'
} )

// HTTP-4xx mock — Sub-Agent interpreted a 4xx response. Per memory
// feedback_http_400_is_not_pass, no answer must score PASS / A / 5.0.
// We model FAIL via score "fail" (categorical) and a low numeric for variety.
const buildAnswerHttpFail = ( { area, index, httpStatus } ) => {
    const useCategorical = index % 2 === 0
    if( useCategorical === true ) {
        return {
            questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
            score: 'fail',
            reasoning: `HTTP ${ httpStatus } — endpoint returned client error. Never PASS per feedback_http_400_is_not_pass.`,
            evidence: { httpStatus, body: 'redacted' }
        }
    }
    return {
        questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
        score: 1.5,
        reasoning: `HTTP ${ httpStatus } observed — sub-2.0 score per HTTP-4xx-rule.`,
        evidence: { httpStatus }
    }
}

const buildResponseHttp4xx = ( { area, personaRequired, answerCount } ) => {
    const httpStatus = 401
    const answers = Array
        .from( { length: answerCount } )
        .map( ( _, i ) => buildAnswerHttpFail( { area, index: i, httpStatus } ) )
    const persona = personaRequired === true
        ? buildPersona()
        : null
    return {
        gradingId: FIXED_GRADING_ID,
        schemaHash: FIXED_SCHEMA_HASH,
        area,
        iteration: 1,
        timestamp: FIXED_TIMESTAMP,
        persona,
        harness: 'claude-code',
        answers,
        improvementHints: [
            {
                targetField: 'auth.apiKey',
                suggestion: `HTTP ${ httpStatus } indicates missing/invalid credentials — Generator must surface required key.`,
                priority: 'high'
            }
        ]
    }
}

AREAS
    .forEach( ( spec ) => {
        const { area } = spec
        const dir = join( HERE, area )
        mkdirSync( dir, { recursive: true } )
        writeFileSync( join( dir, 'prompt-artifact.txt' ), buildPromptArtifact( spec ) )
        writeFileSync(
            join( dir, 'mock-response-pass.json' ),
            JSON.stringify( buildResponsePass( spec ), null, 4 ) + '\n'
        )
        writeFileSync(
            join( dir, 'mock-response-blocker.json' ),
            JSON.stringify( buildResponseBlocker( spec ), null, 4 ) + '\n'
        )
        writeFileSync(
            join( dir, 'mock-response-http-4xx.json' ),
            JSON.stringify( buildResponseHttp4xx( spec ), null, 4 ) + '\n'
        )
        console.log( `[ok] fixtures written for ${ area }` )
    } )
