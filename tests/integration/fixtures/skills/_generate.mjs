// Deterministic fixture generator for tests/integration/skills.test.mjs
// Run once to (re)generate prompt-artifact.txt, mock-response-pass.json,
// mock-response-blocker.json, mock-response-http-4xx.json per area.
//
// Usage:  node tests/integration/fixtures/skills/_generate.mjs
//
// Per Memo 082 Kap 7.4 — Persona-Anwendung pro Bereich; Kap 8 — Blocker-Pattern;
// Kap 9 — Output-Schema; Memory feedback_http_400_is_not_pass — HTTP 4xx never PASS.

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
    { area: 'namespace-skills',           personaRequired: true,  answerCount: 6 }
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
    lines.push( '## Datei-Vorbereitung (Pflicht — strikte Reihenfolge)' )
    lines.push( '' )
    lines.push( 'Lies die folgenden Dateien in dieser Reihenfolge BEVOR du eine Frage beantwortest.' )
    lines.push( 'Falls eine Datei nicht existiert oder nicht lesbar ist, antworte ausschliesslich' )
    lines.push( 'mit { "blocker": "<dateipfad>", "reason": "<grund>" } und brich ab.' )
    lines.push( '' )
    lines.push( `1. /tmp/${ area }/source.md  — Source-Artefakt fuer ${ area }` )

    if( personaRequired === true ) {
        lines.push( '' )
        lines.push( '## PERSONA: decision-maker--crypto-trader' )
        lines.push( '[Lens: crypto-trader, Base: decision-maker]' )
    }

    lines.push( '' )
    lines.push( `## Fragen (Area: ${ area })` )
    lines.push( '' )
    lines.push( '1. Erste Eval-Frage des Bereichs.' )
    lines.push( '2. Zweite Eval-Frage des Bereichs.' )
    lines.push( '' )
    lines.push( `## Output-Schema: prompts/output-schemas/${ area }.schema.json` )
    return lines.join( '\n' ) + '\n'
}

const buildAnswerPass = ( { area, index } ) => ( {
    questionId: `Q-${ area }-${ NUM_PAD( index + 1 ) }`,
    score: 4.5,
    reasoning: `Mock pass answer for ${ area } question ${ index + 1 }.`,
    evidence: `/tmp/${ area }/source.md:1`
} )

const buildResponsePass = ( { area, personaRequired, answerCount } ) => {
    const answers = Array
        .from( { length: answerCount } )
        .map( ( _, i ) => buildAnswerPass( { area, index: i } ) )
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
