/**
 * Integration tests for the 11th grading area: selection-aggregate.
 *
 * Verifies (PRD-008 acceptance criteria):
 *  - selection-aggregate.schema.json validates a good envelope (det + non-det
 *    answers, shared _master envelope, area const) via Ajv2020 + ajv-formats.
 *  - it rejects a bad envelope (missing persona / missing naReason on n/a).
 *  - the skill triad (start-grade / evaluate / apply-improvement) exists.
 *  - the evaluate skill mirrors the sibling contract (Read-only tools, neutral
 *    sub-agent, HTTP-4xx rule, blocker pattern, schema reference, wiring).
 *  - the integration fixtures exist and the HTTP-4xx fixture never scores PASS.
 *
 * No real LLM/network — fixtures only.
 */

import { describe, it, expect } from '@jest/globals'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'


const HERE = dirname( fileURLToPath( import.meta.url ) )
const ROOT = join( HERE, '..', '..' )
const SKILLS_DIR = join( ROOT, 'skills' )
const SCHEMAS_DIR = join( ROOT, 'prompts', 'output-schemas' )
const FIXTURE_DIR = join( HERE, 'fixtures', 'skills', 'selection-aggregate' )

const AREA = 'selection-aggregate'
const ANSWER_COUNT = 6


const buildAjv = () => {
    const ajv = new Ajv2020.default( { allErrors: true, strict: false } )
    addFormats.default( ajv )
    const master = JSON.parse( readFileSync( join( SCHEMAS_DIR, '_master.schema.json' ), 'utf-8' ) )
    ajv.addSchema( master, '_master.schema.json' )
    return ajv
}

const loadSchema = () => JSON.parse(
    readFileSync( join( SCHEMAS_DIR, `${ AREA }.schema.json` ), 'utf-8' )
)

const loadFixture = ( { name } ) => JSON.parse(
    readFileSync( join( FIXTURE_DIR, name ), 'utf-8' )
)


describe( 'selection-aggregate — output schema (Ajv2020 + ajv-formats)', () => {

    it( 'schema file exists and is valid JSON draft 2020-12', () => {
        const schema = loadSchema()
        expect( schema[ '$schema' ] ).toBe( 'https://json-schema.org/draft/2020-12/schema' )
        expect( schema.oneOf ).toBeDefined()
    } )

    it( 'compiles via _master.schema.json registered once through addSchema', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        expect( typeof validate ).toBe( 'function' )
    } )

    it( 'validates a good envelope with merged deterministic + non-deterministic answers', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const good = loadFixture( { name: 'mock-response-pass.json' } )
        const valid = validate( good )
        if( valid === false ) {
            console.error( 'good-envelope errors:', JSON.stringify( validate.errors, null, 2 ) )
        }
        expect( valid ).toBe( true )

        // det (categorical) AND non-det (numeric) answers both present
        const scores = good.answers.map( ( a ) => a.score )
        const hasCategorical = scores.some( ( s ) => typeof s === 'string' )
        const hasNumeric = scores.some( ( s ) => typeof s === 'number' )
        expect( hasCategorical ).toBe( true )
        expect( hasNumeric ).toBe( true )
    } )

    it( 'good envelope carries the shared fields + area const + 6 answers', () => {
        const good = loadFixture( { name: 'mock-response-pass.json' } )
        expect( good.area ).toBe( AREA )
        expect( good.harness ).toBe( 'claude-code' )
        expect( good.persona ).toHaveProperty( 'basePersonaId' )
        expect( good.persona ).toHaveProperty( 'lensId' )
        expect( good.answers.length ).toBe( ANSWER_COUNT )
    } )

    it( 'rejects an envelope missing the (required) persona', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const bad = loadFixture( { name: 'mock-response-pass.json' } )
        delete bad.persona
        expect( validate( bad ) ).toBe( false )
    } )

    it( 'rejects an n/a answer that omits naReason', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const bad = loadFixture( { name: 'mock-response-pass.json' } )
        bad.answers[ 0 ] = {
            questionId: 'Q-selection-aggregate-01',
            score: 'n/a',
            reasoning: 'Members below threshold — but naReason intentionally omitted.'
        }
        expect( validate( bad ) ).toBe( false )
    } )

    it( 'accepts an n/a answer that supplies a closed-set naReason', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const ok = loadFixture( { name: 'mock-response-pass.json' } )
        ok.answers[ 0 ] = {
            questionId: 'Q-selection-aggregate-01',
            score: 'n/a',
            reasoning: 'Fewer than 5 members — no selection phases (cascade-stop).',
            naReason: 'blocked-by-precondition'
        }
        expect( validate( ok ) ).toBe( true )
    } )

    it( 'rejects an unknown questionId outside the area enum', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const bad = loadFixture( { name: 'mock-response-pass.json' } )
        bad.answers[ 0 ].questionId = 'Q-some-other-area-01'
        expect( validate( bad ) ).toBe( false )
    } )

    it( 'validates the blocker branch of the oneOf', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const blocker = loadFixture( { name: 'mock-response-blocker.json' } )
        expect( validate( blocker ) ).toBe( true )
    } )

} )


describe( 'selection-aggregate — skill triad', () => {

    const phases = [ 'start-grade', 'evaluate', 'apply-improvement' ]

    phases
        .forEach( ( phase ) => {
            it( `skill ${ AREA }-${ phase }/SKILL.md exists`, () => {
                const path = join( SKILLS_DIR, `${ AREA }-${ phase }`, 'SKILL.md' )
                expect( existsSync( path ) ).toBe( true )
            } )
        } )

    it( 'evaluate skill is Read-only and mirrors the sibling contract', () => {
        const content = readFileSync(
            join( SKILLS_DIR, `${ AREA }-evaluate`, 'SKILL.md' ),
            'utf-8'
        )
        const fmMatch = content.match( /^---\n([\s\S]*?)\n---/ )
        expect( fmMatch ).not.toBeNull()
        const fm = fmMatch[ 1 ]
        expect( fm ).toContain( `name: ${ AREA }-evaluate` )
        expect( fm ).toContain( 'allowed-tools: Read, Grep, Glob' )
        expect( fm ).toContain( 'model: inherit' )

        expect( content ).toMatch( /NOT know the optimization goal/i )
        expect( content ).toMatch( /4xx/ )
        expect( content ).toMatch( /never PASS/i )
        expect( content ).toMatch( /"blocker"/ )
        expect( content ).toMatch( /"reason"/ )
        expect( content ).toMatch( new RegExp( `${ AREA }-start-grade` ) )
        expect( content ).toMatch( new RegExp( `${ AREA }-apply-improvement` ) )
        expect( content ).toMatch( new RegExp( `prompts/output-schemas/${ AREA }\\.schema\\.json` ) )
    } )

    it( 'start-grade skill surfaces the [GRADING] convention', () => {
        const content = readFileSync(
            join( SKILLS_DIR, `${ AREA }-start-grade`, 'SKILL.md' ),
            'utf-8'
        )
        expect( content ).toContain( '[GRADING] area=selection-aggregate' )
        expect( content ).toContain( '[GRADING] DONE' )
    } )

} )


describe( 'selection-aggregate — fixtures', () => {

    it( 'all four fixtures exist', () => {
        const names = [
            'prompt-artifact.txt',
            'mock-response-pass.json',
            'mock-response-blocker.json',
            'mock-response-http-4xx.json'
        ]
        names
            .forEach( ( name ) => {
                expect( existsSync( join( FIXTURE_DIR, name ) ) ).toBe( true )
            } )
    } )

    it( 'HTTP-4xx fixture never scores PASS / A / >= 5.0', () => {
        const http = loadFixture( { name: 'mock-response-http-4xx.json' } )
        const scores = http.answers.map( ( a ) => a.score )
        expect( scores ).not.toContain( 'pass' )
        expect( scores ).not.toContain( 'PASS' )
        expect( scores ).not.toContain( 'A' )
        const numeric = scores.filter( ( s ) => typeof s === 'number' )
        numeric
            .forEach( ( s ) => {
                expect( s ).toBeLessThan( 5.0 )
            } )
    } )

    it( 'HTTP-4xx fixture validates against the area schema (FAIL-shape)', () => {
        const ajv = buildAjv()
        const validate = ajv.compile( loadSchema() )
        const http = loadFixture( { name: 'mock-response-http-4xx.json' } )
        expect( validate( http ) ).toBe( true )
    } )

} )
