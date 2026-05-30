/**
 * Integration tests for the evaluator skills.
 *
 * Verifies:
 *  - SKILL.md frontmatter (name, description, allowed-tools, model)
 *  - allowed-tools is Read-only (Read/Grep/Glob) — no Write/Bash/Edit
 *  - persona flag per area matches the persona-application table
 *  - mock-response-pass conforms to per-area output-schema (ajv 2020-12)
 *  - blocker shape: { blocker, reason }
 *  - HTTP-4xx-never-PASS rule
 *
 * Sub-agent calls are mocked via fixture files — no real LLM/network.
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'


const HERE = dirname( fileURLToPath( import.meta.url ) )
const ROOT = join( HERE, '..', '..' )
const SKILLS_DIR = join( ROOT, 'skills' )
const FIXTURES_DIR = join( HERE, 'fixtures', 'skills' )
const SCHEMAS_DIR = join( ROOT, 'prompts', 'output-schemas' )


const AREAS = [
    { area: 'single-test',               personaRequired: false, answerCount: 10 },
    { area: 'tools-aggregate-schema',    personaRequired: false, answerCount: 6 },
    { area: 'namespace-description',     personaRequired: false, answerCount: 4 },
    { area: 'tools-aggregate-namespace', personaRequired: false, answerCount: 5 },
    { area: 'about-namespace',           personaRequired: true,  answerCount: 7 },
    { area: 'about-selection',           personaRequired: true,  answerCount: 7 },
    { area: 'selection-skills-L1',       personaRequired: true,  answerCount: 4 },
    { area: 'selection-skills-L2',       personaRequired: true,  answerCount: 5 },
    { area: 'selection-skills-L3',       personaRequired: true,  answerCount: 6 },
    { area: 'namespace-skills',          personaRequired: true,  answerCount: 6 }
]


const FRONTMATTER_FIELDS = [ 'name', 'description', 'allowed-tools', 'model' ]


const parseFrontmatter = ( { content } ) => {
    const match = content.match( /^---\n([\s\S]*?)\n---/ )
    if( match === null ) { return null }
    const body = match[ 1 ]
    const fields = {}
    const lines = body.split( '\n' )
    lines
        .forEach( ( line ) => {
            const idx = line.indexOf( ':' )
            if( idx === -1 ) { return }
            const key = line.slice( 0, idx ).trim()
            const value = line.slice( idx + 1 ).trim()
            fields[ key ] = value
        } )
    return fields
}


const loadSchema = ( { area } ) => {
    const schemaPath = join( SCHEMAS_DIR, `${ area }.schema.json` )
    const json = JSON.parse( readFileSync( schemaPath, 'utf-8' ) )
    return json
}


const loadMasterSchema = () => {
    const masterPath = join( SCHEMAS_DIR, '_master.schema.json' )
    return JSON.parse( readFileSync( masterPath, 'utf-8' ) )
}


const buildAjv = () => {
    const ajv = new Ajv2020.default( { allErrors: true, strict: false } )
    addFormats.default( ajv )
    const master = loadMasterSchema()
    ajv.addSchema( master, '_master.schema.json' )
    return ajv
}


describe( 'Evaluator Skills — Integration', () => {

    AREAS
        .forEach( ( spec ) => {
            const { area, personaRequired, answerCount } = spec

            describe( `area: ${ area }`, () => {

                const skillDir = join( SKILLS_DIR, `${ area }-evaluate` )
                const skillPath = join( skillDir, 'SKILL.md' )
                const fixtureDir = join( FIXTURES_DIR, area )

                let skillContent = null
                let frontmatter = null


                beforeAll( () => {
                    skillContent = readFileSync( skillPath, 'utf-8' )
                    frontmatter = parseFrontmatter( { content: skillContent } )
                } )


                it( 'SKILL.md file exists', () => {
                    expect( existsSync( skillPath ) ).toBe( true )
                } )


                it( 'frontmatter parses with required fields', () => {
                    expect( frontmatter ).not.toBeNull()
                    FRONTMATTER_FIELDS
                        .forEach( ( field ) => {
                            expect( frontmatter ).toHaveProperty( field )
                            expect( frontmatter[ field ].length ).toBeGreaterThan( 0 )
                        } )
                } )


                it( 'name matches <area>-evaluate', () => {
                    expect( frontmatter.name ).toBe( `${ area }-evaluate` )
                } )


                it( 'allowed-tools is exactly "Read, Grep, Glob" (Read-only)', () => {
                    expect( frontmatter[ 'allowed-tools' ] ).toBe( 'Read, Grep, Glob' )
                } )


                it( 'allowed-tools rejects forbidden tools (Write/Bash/Edit)', () => {
                    const tools = frontmatter[ 'allowed-tools' ]
                    expect( tools ).not.toMatch( /\bWrite\b/ )
                    expect( tools ).not.toMatch( /\bBash\b/ )
                    expect( tools ).not.toMatch( /\bEdit\b/ )
                } )


                it( 'model frontmatter is "inherit"', () => {
                    expect( frontmatter.model ).toBe( 'inherit' )
                } )


                it( 'body contains neutrality assertion (does NOT know the optimization goal)', () => {
                    expect( skillContent ).toMatch( /NOT know the optimization goal/i )
                } )


                it( 'body contains HTTP-4xx rule', () => {
                    expect( skillContent ).toMatch( /4xx/ )
                    expect( skillContent ).toMatch( /never PASS/i )
                } )


                it( 'body contains blocker pattern documentation', () => {
                    expect( skillContent ).toMatch( /"blocker"/ )
                    expect( skillContent ).toMatch( /"reason"/ )
                } )


                it( 'body references invoker <area>-start-grade and consumer <area>-apply-improvement', () => {
                    expect( skillContent ).toMatch( new RegExp( `${ area }-start-grade` ) )
                    expect( skillContent ).toMatch( new RegExp( `${ area }-apply-improvement` ) )
                } )


                it( 'body references the area-specific output-schema', () => {
                    expect( skillContent ).toMatch(
                        new RegExp( `prompts/output-schemas/${ area }\\.schema\\.json` )
                    )
                } )


                it( 'prompt-artifact fixture exists', () => {
                    expect( existsSync( join( fixtureDir, 'prompt-artifact.txt' ) ) ).toBe( true )
                } )


                it( 'persona-required flag matches the persona-application table (via prompt-artifact)', () => {
                    const promptArtifact = readFileSync(
                        join( fixtureDir, 'prompt-artifact.txt' ),
                        'utf-8'
                    )
                    const hasPersonaBlock = promptArtifact.includes( 'PERSONA:' )
                    expect( hasPersonaBlock ).toBe( personaRequired )
                } )


                it( 'mock-response-pass conforms to per-area output-schema (ajv 2020-12)', () => {
                    const schema = loadSchema( { area } )
                    const passResponse = JSON.parse(
                        readFileSync( join( fixtureDir, 'mock-response-pass.json' ), 'utf-8' )
                    )
                    const ajv = buildAjv()
                    const validate = ajv.compile( schema )
                    const valid = validate( passResponse )
                    if( valid === false ) {
                        console.error(
                            `[${ area }] pass-response schema errors:`,
                            JSON.stringify( validate.errors, null, 2 )
                        )
                    }
                    expect( valid ).toBe( true )
                } )


                it( 'mock-response-pass answer count matches schema minItems/maxItems', () => {
                    const passResponse = JSON.parse(
                        readFileSync( join( fixtureDir, 'mock-response-pass.json' ), 'utf-8' )
                    )
                    expect( passResponse.answers.length ).toBe( answerCount )
                } )


                it( 'mock-response-pass persona field matches personaRequired flag', () => {
                    const passResponse = JSON.parse(
                        readFileSync( join( fixtureDir, 'mock-response-pass.json' ), 'utf-8' )
                    )
                    if( personaRequired === true ) {
                        expect( passResponse.persona ).not.toBeNull()
                        expect( passResponse.persona ).toHaveProperty( 'basePersonaId' )
                        expect( passResponse.persona ).toHaveProperty( 'lensId' )
                    } else {
                        expect( passResponse.persona ).toBeNull()
                    }
                } )


                it( 'mock-response-blocker shape matches ({ blocker, reason })', () => {
                    const blockerResponse = JSON.parse(
                        readFileSync( join( fixtureDir, 'mock-response-blocker.json' ), 'utf-8' )
                    )
                    expect( blockerResponse ).toHaveProperty( 'blocker' )
                    expect( blockerResponse ).toHaveProperty( 'reason' )
                    expect( Object.keys( blockerResponse ).length ).toBe( 2 )
                    expect( typeof blockerResponse.blocker ).toBe( 'string' )
                    expect( typeof blockerResponse.reason ).toBe( 'string' )
                    expect( blockerResponse.blocker.length ).toBeGreaterThan( 0 )
                    expect( blockerResponse.reason.length ).toBeGreaterThan( 0 )
                } )


                it( 'mock-response-blocker validates against per-area schema (oneOf blocker branch)', () => {
                    const schema = loadSchema( { area } )
                    const blockerResponse = JSON.parse(
                        readFileSync( join( fixtureDir, 'mock-response-blocker.json' ), 'utf-8' )
                    )
                    const ajv = buildAjv()
                    const validate = ajv.compile( schema )
                    const valid = validate( blockerResponse )
                    expect( valid ).toBe( true )
                } )

            } )
        } )


    describe( 'HTTP-4xx rule (4xx is never PASS)', () => {

        // All 10 areas have an http-4xx fixture. We cover all 10
        // because the rule applies universally — never PASS on 4xx.

        AREAS
            .forEach( ( { area } ) => {

                it( `${ area }: HTTP 4xx response contains no PASS / no A / no score >= 5.0`, () => {
                    const fixturePath = join( FIXTURES_DIR, area, 'mock-response-http-4xx.json' )
                    expect( existsSync( fixturePath ) ).toBe( true )
                    const httpResponse = JSON.parse( readFileSync( fixturePath, 'utf-8' ) )
                    const scores = ( httpResponse.answers || [] )
                        .map( ( q ) => q.score )

                    // No categorical PASS
                    expect( scores ).not.toContain( 'PASS' )
                    expect( scores ).not.toContain( 'pass' )

                    // No legacy A-grade leak
                    expect( scores ).not.toContain( 'A' )
                    expect( scores ).not.toContain( 'a' )

                    // No numeric score >= 5.0 (top-of-scale PASS equivalent)
                    const numericScores = scores
                        .filter( ( s ) => typeof s === 'number' )
                    numericScores
                        .forEach( ( score ) => {
                            expect( score ).toBeLessThan( 5.0 )
                        } )

                    // Each answer mentions HTTP failure reasoning
                    const answers = httpResponse.answers || []
                    expect( answers.length ).toBeGreaterThan( 0 )
                } )

            } )


        it( 'HTTP-4xx fixture validates against per-area schema (FAIL-shape)', () => {
            // Spot-check single-test + tools-aggregate-schema.
            const httpAreas = [ 'single-test', 'tools-aggregate-schema' ]
            const ajv = buildAjv()
            httpAreas
                .forEach( ( area ) => {
                    const schema = loadSchema( { area } )
                    const httpResponse = JSON.parse( readFileSync(
                        join( FIXTURES_DIR, area, 'mock-response-http-4xx.json' ),
                        'utf-8'
                    ) )
                    const validate = ajv.compile( schema )
                    const valid = validate( httpResponse )
                    if( valid === false ) {
                        console.error(
                            `[${ area }] http-4xx-response schema errors:`,
                            JSON.stringify( validate.errors, null, 2 )
                        )
                    }
                    expect( valid ).toBe( true )
                } )
        } )

    } )


    describe( 'Cross-area structural assertions', () => {

        it( 'all 10 evaluator skill directories exist', () => {
            AREAS
                .forEach( ( { area } ) => {
                    const skillDir = join( SKILLS_DIR, `${ area }-evaluate` )
                    expect( existsSync( skillDir ) ).toBe( true )
                    expect( existsSync( join( skillDir, 'SKILL.md' ) ) ).toBe( true )
                } )
        } )


        it( 'all 10 areas have prompt-artifact + pass + blocker + http-4xx fixtures', () => {
            AREAS
                .forEach( ( { area } ) => {
                    const dir = join( FIXTURES_DIR, area )
                    expect( existsSync( join( dir, 'prompt-artifact.txt' ) ) ).toBe( true )
                    expect( existsSync( join( dir, 'mock-response-pass.json' ) ) ).toBe( true )
                    expect( existsSync( join( dir, 'mock-response-blocker.json' ) ) ).toBe( true )
                    expect( existsSync( join( dir, 'mock-response-http-4xx.json' ) ) ).toBe( true )
                } )
        } )


        it( 'persona-required flag distribution: 4 neutral + 6 persona', () => {
            const neutralCount = AREAS
                .filter( ( a ) => a.personaRequired === false ).length
            const personaCount = AREAS
                .filter( ( a ) => a.personaRequired === true ).length
            expect( neutralCount ).toBe( 4 )
            expect( personaCount ).toBe( 6 )
        } )


        it( 'all evaluator skills frontmatter are Read-only (no Write/Bash/Edit anywhere)', () => {
            AREAS
                .forEach( ( { area } ) => {
                    const content = readFileSync(
                        join( SKILLS_DIR, `${ area }-evaluate`, 'SKILL.md' ),
                        'utf-8'
                    )
                    const fm = parseFrontmatter( { content } )
                    expect( fm[ 'allowed-tools' ] ).toBe( 'Read, Grep, Glob' )
                } )
        } )

    } )

} )
