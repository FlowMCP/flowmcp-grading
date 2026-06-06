import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals'
import { mkdtemp, rm, readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


// --- flowmcp/v2 mock ---------------------------------------------------------
// The mock is programmable per test via fetchQueue / resourceQueue. No network,
// no .env: every call pulls a canned result. fetch is also a jest.fn so tests
// can assert that stub primitives never reach the fetch layer.

let fetchQueue = []
let resourceQueue = []

const fetchMock = jest.fn( async () => {
    if( fetchQueue.length === 0 ) {
        return { status: false, messages: [ 'no canned fetch result' ], dataAsString: null }
    }
    return fetchQueue.shift()
} )

const executeResourceMock = jest.fn( async () => {
    if( resourceQueue.length === 0 ) {
        return { struct: { status: false, messages: [ 'no canned resource result' ], data: null } }
    }
    return resourceQueue.shift()
} )

jest.unstable_mockModule( 'flowmcp/v2', () => {
    return {
        FlowMCP: {
            fetch: fetchMock,
            executeResource: executeResourceMock,
            resolveSharedLists: async () => ( { sharedLists: {} } ),
            createHandlers: () => ( { handlerMap: {}, resourceHandlerMap: {} } )
        }
    }
} )


const { DataPretest } = await import( '../../src/DataPretest.mjs' )


// --- helpers -----------------------------------------------------------------

let tempRoot = null

const successFetch = ( { result } ) => {
    return { status: true, messages: [], dataAsString: JSON.stringify( { status: '1', result } ) }
}

const makeMainWithToolTests = ( { count } ) => {
    const tests = Array.from( { length: count } )
        .map( ( _entry, idx ) => ( { _description: `case ${idx}`, address: `0xabc${idx}` } ) )
    return {
        namespace: 'etherscan',
        requiredServerParams: [],
        tools: {
            getBalance: { description: 'get balance', tests }
        }
    }
}


// A parameterless tool: parameters[] declares no {{USER_PARAM}} input and every
// test case carries only a _description (no userParams). Matches the canonical v4
// parameterless shape (e.g. mudab getStations).
const makeMainParameterless = ( { count } ) => {
    const tests = Array.from( { length: count } )
        .map( ( _entry, idx ) => ( { _description: `case ${idx}` } ) )
    return {
        namespace: 'mudab',
        requiredServerParams: [],
        tools: {
            getStations: { description: 'get all stations', parameters: [], tests }
        }
    }
}


// A fresh island per test: read-cache (PRD-2.1) is default-on, so re-running the
// same namespace/schema against a shared island would (correctly) serve the
// second run from disk. Each test gets its own empty gradingDataDir so the
// per-test fetch assertions stay deterministic; the cache tests that DO exercise
// reuse allocate their own dirs explicitly.
beforeEach( async () => {
    fetchQueue = []
    resourceQueue = []
    fetchMock.mockClear()
    executeResourceMock.mockClear()
    tempRoot = await mkdtemp( join( tmpdir(), 'datapretest-' ) )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'DataPretest.getVersion', () => {
    test( 'returns a version string', () => {
        const result = DataPretest.getVersion()
        expect( typeof result.version ).toBe( 'string' )
        expect( result.version.length ).toBeGreaterThan( 0 )
    } )
} )


describe( 'DataPretest typed-test extraction + happy path', () => {
    test( 'three working tool tests pass the abort rule and persist a payload', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } ),
            successFetch( { result: '77310' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        expect( out.passedDownloadable ).toBe( 3 )
        // The pass bar is 2 working tests; 3 working clears it as the ideal rung.
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toBeNull()
        expect( out.errors ).toEqual( [] )
        expect( out.results ).toHaveLength( 3 )
        expect( out.results.every( ( r ) => r.primitive === 'tool' && r.working === true ) ).toBe( true )
        expect( out.perTool.getBalance ).toMatchObject( { working: 3, total: 3, level: 'data-analyzable', class: 'normal', bar: 2, parameterless: false } )

        // summary.json — human-readable, no opaque hash
        const summary = JSON.parse( await readFile( out.summaryPath, 'utf-8' ) )
        expect( summary.namespace ).toBe( 'etherscan' )
        expect( summary.schemaFile ).toBe( 'getBalance' )
        expect( summary.ok ).toBe( true )
        expect( summary.perTool.getBalance ).toMatchObject( { working: 3, total: 3, level: 'data-analyzable', class: 'normal', bar: 2, parameterless: false } )
        expect( out.summaryPath ).toContain( join( 'providers', 'etherscan', 'getBalance', 'summary.json' ) )

        // per-test files: numbered + self-describing (real response + HTTP status,
        // NO request — F26 forbids persisting interpolated {{KEY}} server params)
        const t1 = JSON.parse( await readFile( join( out.schemaDir, 'tools', 'getBalance', 'tests', 'test-1.json' ), 'utf-8' ) )
        expect( t1.test ).toBe( 1 )
        expect( t1.tool ).toBe( 'getBalance' )
        expect( t1.status ).toBe( true )
        expect( t1.working ).toBe( true )
        expect( Object.prototype.hasOwnProperty.call( t1, 'request' ) ).toBe( false )
        expect( t1.response ).not.toBeNull()
        const t3 = JSON.parse( await readFile( join( out.schemaDir, 'tools', 'getBalance', 'tests', 'test-3.json' ), 'utf-8' ) )
        expect( t3.test ).toBe( 3 )
    } )
} )


describe( 'DataPretest abort rule', () => {
    test( 'one working test (below the bar of 2) -> ok:false with DPT-003, not green', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } )
        ]
        const main = makeMainWithToolTests( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 1 )
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toContain( 'tools-below-2' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
        // Test-Leiter: 1 working is `reachable` (minimum, insufficient — not green).
        expect( out.perTool.getBalance.level ).toBe( 'reachable' )
    } )

    test( 'exactly two working tests clear the bar -> ok:true, level schema-validatable (deterministic-green)', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toBeNull()
        expect( out.perTool.getBalance.level ).toBe( 'schema-validatable' )
    } )

    test( 'per-tool gate: one fully-working tool does NOT mask a sibling with zero working tests', async () => {
        // getBalance: 3 working; getSupply: 3 failing. Schema-file total = 3 (>=3),
        // but the per-tool rule must FAIL because getSupply has 0/3 working.
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } ),
            successFetch( { result: '77310' } )
            // getSupply's 3 tests hit the empty queue -> status:false -> 0 working
        ]
        const main = {
            namespace: 'etherscan',
            requiredServerParams: [],
            tools: {
                getBalance: { description: 'get balance', tests: [ { address: '0x1' }, { address: '0x2' }, { address: '0x3' } ] },
                getSupply: { description: 'get supply', tests: [ { address: '0x4' }, { address: '0x5' }, { address: '0x6' } ] }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'multi',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.passedDownloadable ).toBe( 3 )
        expect( out.ok ).toBe( false )
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'getSupply' ) ) ).toBe( true )
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'getBalance' ) ) ).toBe( false )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
    } )

    test( 'custom minWorkingTests threshold is honoured', async () => {
        fetchQueue = [ successFetch( { result: '1' } ) ]
        const main = makeMainWithToolTests( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            minWorkingTests: 1
        } )

        expect( out.ok ).toBe( true )
        expect( out.required ).toBe( 1 )
    } )
} )


describe( 'DataPretest HTTP-4xx / empty-data rules', () => {
    test( 'an HTTP-4xx style fetch (status:false) is NOT a pass', async () => {
        fetchQueue = [
            { status: false, messages: [ 'HTTP 401 Unauthorized' ], dataAsString: null },
            { status: false, messages: [ 'HTTP 403 Forbidden' ], dataAsString: null },
            { status: false, messages: [ 'HTTP 429 Too Many Requests' ], dataAsString: null }
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.every( ( r ) => r.working === false ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-004' ) && e.includes( '401' ) ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
    } )

    test( 'status:true but empty data does NOT count as working', async () => {
        fetchQueue = [
            { status: true, messages: [], dataAsString: '[]' },
            { status: true, messages: [], dataAsString: '' },
            { status: true, messages: [], dataAsString: '{}' }
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.every( ( r ) => r.hasData === false ) ).toBe( true )
    } )

    test( 'PRD-014: missing required server parameter -> key-gated own class (DPT-007), NOT a FAIL', async () => {
        // No fetch results are needed: a key-gated schema SKIPS the futile live call.
        const main = makeMainWithToolTests( { count: 3 } )
        main.requiredServerParams = [ 'ETHERSCAN_API_KEY' ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            serverParams: {}
        } )

        // Own class — not evaluable without key. DPT-007 carries the key NAME.
        expect( out.keyGated ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-007' ) && e.includes( 'ETHERSCAN_API_KEY' ) ) ).toBe( true )
        // It is NOT a FAIL: no DPT-003 / DPT-004 from key-gating, no FAIL set.
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( false )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-004' ) ) ).toBe( false )
        expect( out.toolsBelowThreshold ).toEqual( [] )
        expect( out.stopReason ).toBe( 'key-gated-not-evaluable-without-key' )
        // The futile 4xx live call is skipped: the fetch layer is never reached.
        expect( fetchMock ).not.toHaveBeenCalled()
        // Per-tool class is surfaced (visible), not invisible.
        expect( out.perTool.getBalance.class ).toBe( 'key-gated' )
    } )

    test( 'PRD-014: with the key present, the schema runs the normal live path', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )
        main.requiredServerParams = [ 'ETHERSCAN_API_KEY' ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            serverParams: { ETHERSCAN_API_KEY: 'present-key-value' }
        } )

        expect( out.keyGated ).toBe( false )
        expect( out.ok ).toBe( true )
        expect( out.perTool.getBalance.class ).toBe( 'normal' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-007' ) ) ).toBe( false )
    } )

    test( 'PRD-014: a partially-missing key set (one of several) is still key-gated', async () => {
        const main = makeMainWithToolTests( { count: 3 } )
        main.requiredServerParams = [ 'KEY_A', 'KEY_B' ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            serverParams: { KEY_A: 'present' }
        } )

        expect( out.keyGated ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-007' ) && e.includes( 'KEY_B' ) && !e.includes( 'KEY_A' ) ) ).toBe( true )
        expect( fetchMock ).not.toHaveBeenCalled()
    } )
} )


describe( 'DataPretest structural primitives (real v4 validation, F10/P1)', () => {
    test( 'skill / prompt / selection-member never count toward the downloadable threshold and never reach the fetch layer', async () => {
        const main = {
            namespace: 'demo',
            requiredServerParams: [],
            skills: [ { name: 'skillA' }, { name: 'skillB' } ],
            prompts: [ { name: 'promptA', tests: [ {} ] } ],
            selection: { tools: [ 'demo.toolX' ], skills: [ { name: 'inlineSkill' } ] }
        }

        const out = await DataPretest.run( {
            namespace: 'demo',
            toolName: 'demoFamily',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.length ).toBeGreaterThan( 0 )
        expect( out.results.every( ( r ) => r.working === false ) ).toBe( true )
        // Structural primitives must never reach the live fetch layer.
        expect( fetchMock ).not.toHaveBeenCalled()
        expect( executeResourceMock ).not.toHaveBeenCalled()
    } )

    test( 'a structurally INVALID skill flips an otherwise-green schema to red via DPT-009 (real validation, not stub-pass)', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )
        // missing version / whenToUse / type / description / content / output
        main.skills = [ { name: 'incomplete' } ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        // the downloadable tool itself passes its Bar=2 ...
        expect( out.passedDownloadable ).toBe( 2 )
        expect( out.perTool.getBalance ).toMatchObject( { working: 2 } )
        // ... yet the invalid skill keeps the schema from deterministic-green
        expect( out.ok ).toBe( false )
        expect( out.stopReason ).toBe( 'structural-primitive-validation-failed' )
        expect( out.errors.some( ( e ) => e.startsWith( 'DPT-009' ) ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'skill "incomplete"' ) ) ).toBe( true )
    } )

    test( 'a structurally VALID prompt does NOT false-fail a green schema (no DPT-009)', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )
        main.prompts = [ { name: 'summarize', tests: [ {} ] } ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        expect( out.stopReason ).toBeNull()
        expect( out.errors.some( ( e ) => e.startsWith( 'DPT-009' ) ) ).toBe( false )
    } )

    test( 'a prompt with a non-string name fails structurally via DPT-009', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )
        main.prompts = [ { name: 42, tests: [ {} ] } ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.errors.some( ( e ) => e.startsWith( 'DPT-009' ) && e.includes( 'prompt' ) ) ).toBe( true )
    } )
} )


describe( 'DataPretest on-disk layout (readable: per-tool numbered tests + summary)', () => {
    test( 'writes providers/<ns>/<schema>/tools/<tool>/tests/test-N.json + summary.json', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'layoutns',
            toolName: 'prices',
            main,
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( true )

        // numbered, self-describing test files under tools/<tool>/tests/
        const toolDir = join( tempRoot, 'providers', 'layoutns', 'prices', 'tools', 'getBalance', 'tests' )
        const files = ( await readdir( toolDir ) ).sort()
        expect( files ).toEqual( [ 'test-1.json', 'test-2.json', 'test-3.json' ] )

        const t2 = JSON.parse( await readFile( join( toolDir, 'test-2.json' ), 'utf-8' ) )
        expect( t2.test ).toBe( 2 )
        expect( t2.tool ).toBe( 'getBalance' )
        expect( t2.response ).not.toBeNull()
        expect( t2.working ).toBe( true )
        // F26: no request field is persisted
        expect( Object.prototype.hasOwnProperty.call( t2, 'request' ) ).toBe( false )

        // summary.json with per-tool gate result, no opaque hash filename
        const summary = JSON.parse( await readFile( join( tempRoot, 'providers', 'layoutns', 'prices', 'summary.json' ), 'utf-8' ) )
        expect( summary.schemaFile ).toBe( 'prices' )
        expect( summary.ok ).toBe( true )
        expect( summary.perTool.getBalance ).toMatchObject( { working: 3, total: 3, level: 'data-analyzable', class: 'normal', bar: 2, parameterless: false } )

        // schema folder holds tools/ + summary.json; the tool lives under tools/
        const schemaFileEntries = await readdir( join( tempRoot, 'providers', 'layoutns', 'prices' ) )
        expect( schemaFileEntries ).not.toContain( 'data-pretest' )
        expect( schemaFileEntries.sort() ).toEqual( [ 'summary.json', 'tools' ] )
        const toolEntries = await readdir( join( tempRoot, 'providers', 'layoutns', 'prices', 'tools', 'getBalance' ) )
        expect( toolEntries ).toContain( 'tests' )
    } )
} )


describe( 'DataPretest F26 key-hygiene (no request, no API key on disk)', () => {
    const collectFiles = async ( { dir } ) => {
        const entries = await readdir( dir, { withFileTypes: true } )
        const nested = await entries
            .reduce( ( promise, entry ) => promise.then( async ( acc ) => {
                const full = join( dir, entry.name )
                if( entry.isDirectory() ) {
                    const sub = await collectFiles( { dir: full } )
                    return acc.concat( sub )
                }
                return acc.concat( [ full ] )
            } ), Promise.resolve( [] ) )
        return nested
    }

    test( 'persisted test files omit request and never leak a serverParams key value', async () => {
        const secret = 'SUPER-SECRET-API-KEY-1234567890'
        fetchQueue = [
            successFetch( { result: 'a' } ),
            successFetch( { result: 'b' } ),
            successFetch( { result: 'c' } )
        ]
        const main = {
            namespace: 'keyns',
            requiredServerParams: [ 'ETHERSCAN_API_KEY' ],
            tools: {
                getBalance: {
                    description: 'get balance',
                    tests: Array.from( { length: 3 } )
                        .map( ( _e, idx ) => ( { _description: `case ${idx}`, address: `0xabc${idx}` } ) )
                }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'keyns',
            toolName: 'getBalance',
            main,
            serverParams: { ETHERSCAN_API_KEY: secret },
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( true )

        const persisted = await collectFiles( { dir: join( tempRoot, 'providers', 'keyns' ) } )
        expect( persisted.length ).toBeGreaterThan( 0 )

        const contents = await persisted
            .reduce( ( promise, file ) => promise.then( async ( acc ) => {
                const body = await readFile( file, 'utf-8' )
                return acc.concat( [ { file, body } ] )
            } ), Promise.resolve( [] ) )

        // No persisted artifact contains the secret key value anywhere.
        contents
            .forEach( ( { body } ) => {
                expect( body.includes( secret ) ).toBe( false )
            } )

        // Every persisted test file omits the `request` field entirely.
        const testFiles = contents
            .filter( ( { file } ) => file.endsWith( '.json' ) && file.includes( join( 'tests', 'test-' ) ) )
        expect( testFiles.length ).toBe( 3 )
        testFiles
            .forEach( ( { body } ) => {
                const parsed = JSON.parse( body )
                expect( Object.prototype.hasOwnProperty.call( parsed, 'request' ) ).toBe( false )
                expect( parsed.response ).not.toBeNull()
            } )
    } )
} )


describe( 'DataPretest input validation', () => {
    test( 'missing toolName yields DPT-001', async () => {
        const out = await DataPretest.run( {
            namespace: 'x',
            main: { namespace: 'x' },
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( false )
        expect( out.stopReason ).toBe( 'invalid-input' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-001' ) ) ).toBe( true )
    } )
} )


// dryRun runs the pretest in full but persists
// NOTHING. No test-N.json, no summary.json — schemaDir/summaryPath are null
// (NO SILENT DEFAULT, no fabricated path) and saved: false is returned.
describe( 'DataPretest dryRun (no persist)', () => {
    test( 'dryRun: true skips #persist — null paths, saved:false, no files on disk', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )
        const dryNs = `dryrun-${Date.now()}`

        const out = await DataPretest.run( {
            namespace: dryNs,
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            dryRun: true
        } )

        // Result is still computed and returned in full.
        expect( out.ok ).toBe( true )
        expect( out.passedDownloadable ).toBe( 3 )
        expect( out.perTool.getBalance ).toMatchObject( { working: 3, total: 3, level: 'data-analyzable', class: 'normal', bar: 2, parameterless: false } )
        expect( out.results ).toHaveLength( 3 )

        // No path fabricated, explicit not-saved marker.
        expect( out.schemaDir ).toBeNull()
        expect( out.summaryPath ).toBeNull()
        expect( out.saved ).toBe( false )

        // The provider folder for this namespace was never created.
        const provDir = join( tempRoot, 'providers', dryNs )
        let exists = true
        try {
            await readdir( provDir )
        } catch {
            exists = false
        }
        expect( exists ).toBe( false )
    } )

    test( 'default (dryRun absent) still persists — saved:true and a real summaryPath', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )
        const saveNs = `saved-${Date.now()}`

        const out = await DataPretest.run( {
            namespace: saveNs,
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.saved ).toBe( true )
        expect( out.summaryPath ).not.toBeNull()
        const summary = JSON.parse( await readFile( out.summaryPath, 'utf-8' ) )
        expect( summary.namespace ).toBe( saveNs )
    } )
} )


// PRD-013 — parameterless tools get their OWN Bar=1 class without lowering Bar=2
// for parametered tools; a tool with 0 tests[] becomes VISIBLE (needs-tests).
describe( 'DataPretest PRD-013 parameterless detection + own Bar=1 class', () => {
    test( 'a parameterless tool with exactly 1 working test is deterministic-green (Bar=1)', async () => {
        fetchQueue = [ successFetch( { result: 'station-a' } ) ]
        const main = makeMainParameterless( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'mudab',
            toolName: 'getStations',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        expect( out.perTool.getStations.parameterless ).toBe( true )
        expect( out.perTool.getStations.bar ).toBe( 1 )
        expect( out.perTool.getStations.class ).toBe( 'parameterless' )
        expect( out.perTool.getStations.working ).toBe( 1 )
        expect( out.toolsBelowThreshold ).toEqual( [] )
        // The own-class marker is surfaced explicitly (DPT-006), not swallowed.
        expect( out.errors.some( ( e ) => e.includes( 'DPT-006' ) && e.includes( 'getStations' ) ) ).toBe( true )
    } )

    test( 'a NORMAL (parametered) tool with 1 working test stays NOT-green — Bar=2 is NOT lowered', async () => {
        fetchQueue = [ successFetch( { result: '284938' } ) ]
        const main = makeMainWithToolTests( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.perTool.getBalance.parameterless ).toBe( false )
        expect( out.perTool.getBalance.bar ).toBe( 2 )
        expect( out.perTool.getBalance.class ).toBe( 'normal' )
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'getBalance (1/2)' ) ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
        // No parameterless marker for a parametered tool.
        expect( out.errors.some( ( e ) => e.includes( 'DPT-006' ) ) ).toBe( false )
    } )

    test( 'a tool with 0 tests[] is VISIBLE in perTool as needs-tests (not silently invisible)', async () => {
        const main = {
            namespace: 'demo',
            requiredServerParams: [],
            tools: {
                hasTests: { description: 'has tests', parameters: [], tests: [ { _description: 'a' } ] },
                noTests: { description: 'no tests at all', parameters: [], tests: [] }
            }
        }
        fetchQueue = [ successFetch( { result: 'x' } ) ]

        const out = await DataPretest.run( {
            namespace: 'demo',
            toolName: 'demoFamily',
            main,
            gradingDataDir: tempRoot
        } )

        // The 0-test tool appears with its own class instead of vanishing.
        expect( Object.prototype.hasOwnProperty.call( out.perTool, 'noTests' ) ).toBe( true )
        expect( out.perTool.noTests.class ).toBe( 'needs-tests' )
        expect( out.perTool.noTests.total ).toBe( 0 )
        expect( out.perTool.noTests.working ).toBe( 0 )
        // It still keeps ok=false (a 0-test tool is not green) — surfaced, not faked.
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'noTests' ) ) ).toBe( true )
    } )
} )


// PRD-015 — broken tests visible with real HTTP status (DPT-004); byte-identical
// duplicate tests detected (DPT-008) and counted once.
describe( 'DataPretest PRD-015 broken-test HTTP status + duplicate detection', () => {
    test( 'a broken test surfaces DPT-004 carrying the real HTTP status', async () => {
        fetchQueue = [
            { status: false, messages: [ 'HTTP 400: Bad Request' ], dataAsString: null },
            { status: false, messages: [ 'HTTP 400: Bad Request' ], dataAsString: null }
        ]
        const main = {
            namespace: 'boldsystems',
            requiredServerParams: [],
            tools: {
                executeQuery: {
                    description: 'run query',
                    parameters: [ { position: { key: 'q', value: '{{USER_PARAM}}', location: 'query' } } ],
                    tests: [ { _description: 'a', q: 'one' }, { _description: 'b', q: 'two' } ]
                }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'boldsystems',
            toolName: 'executeQuery',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-004' ) && e.includes( 'HTTP 400' ) ) ).toBe( true )
        // The structured status field is present on the result entry too.
        expect( out.results.every( ( r ) => r.httpStatus === 400 ) ).toBe( true )
    } )

    test( 'two byte-identical tests (only _description differs) -> DPT-008, duplicate counts once', async () => {
        // Both fetches succeed; without dedup the tool would falsely clear Bar=2 on a
        // single real input. The duplicate must NOT count.
        fetchQueue = [
            successFetch( { result: 'same' } ),
            successFetch( { result: 'same' } )
        ]
        const main = {
            namespace: 'etherscan',
            requiredServerParams: [],
            tools: {
                getBalance: {
                    description: 'get balance',
                    parameters: [ { position: { key: 'address', value: '{{USER_PARAM}}', location: 'query' } } ],
                    tests: [
                        { _description: 'first', address: '0xSAME' },
                        { _description: 'duplicate of first', address: '0xSAME' }
                    ]
                }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        // Duplicate is flagged and counted once: only 1 working -> below Bar=2.
        expect( out.errors.some( ( e ) => e.includes( 'DPT-008' ) && e.includes( 'getBalance' ) ) ).toBe( true )
        expect( out.perTool.getBalance.working ).toBe( 1 )
        expect( out.ok ).toBe( false )
        const dupResult = out.results.find( ( r ) => r.isDuplicate === true )
        expect( dupResult ).not.toBeUndefined()
        expect( dupResult.working ).toBe( false )
    } )
} )


describe( 'DataPretest read-cache (PRD-2.1)', () => {
    test( 'a second run reuses persisted test-N.json without re-fetching', async () => {
        const dir = await mkdtemp( join( tmpdir(), 'datapretest-cache-' ) )
        const main = makeMainWithToolTests( { count: 3 } )

        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } ),
            successFetch( { result: '77310' } )
        ]
        const first = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir } )
        expect( first.ok ).toBe( true )
        expect( first.fromCache ).toBe( false )
        expect( fetchMock ).toHaveBeenCalledTimes( 3 )

        fetchMock.mockClear()
        fetchQueue = []
        const second = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir } )
        expect( second.fromCache ).toBe( true )
        expect( fetchMock ).toHaveBeenCalledTimes( 0 )
        expect( second.ok ).toBe( true )
        expect( second.passedDownloadable ).toBe( 3 )
        expect( second.perTool.getBalance ).toMatchObject( { working: 3, total: 3, bar: 2 } )
        expect( typeof second.dataAt ).toBe( 'string' )
        expect( second.dataAt ).toBe( first.dataAt )

        await rm( dir, { recursive: true, force: true } )
    } )

    test( 'force:true bypasses the cache and re-fetches', async () => {
        const dir = await mkdtemp( join( tmpdir(), 'datapretest-force-' ) )
        const main = makeMainWithToolTests( { count: 3 } )

        fetchQueue = [ successFetch( { result: 'a' } ), successFetch( { result: 'b' } ), successFetch( { result: 'c' } ) ]
        await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir } )

        fetchMock.mockClear()
        fetchQueue = [ successFetch( { result: 'x' } ), successFetch( { result: 'y' } ), successFetch( { result: 'z' } ) ]
        const forced = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir, force: true } )
        expect( forced.fromCache ).toBe( false )
        expect( fetchMock ).toHaveBeenCalledTimes( 3 )
        expect( forced.ok ).toBe( true )

        await rm( dir, { recursive: true, force: true } )
    } )

    test( 'no persisted data -> cache miss, fetches live (first run is uncached)', async () => {
        const dir = await mkdtemp( join( tmpdir(), 'datapretest-miss-' ) )
        const main = makeMainWithToolTests( { count: 2 } )
        fetchQueue = [ successFetch( { result: '1' } ), successFetch( { result: '2' } ) ]
        const out = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir } )
        expect( out.fromCache ).toBe( false )
        expect( fetchMock ).toHaveBeenCalledTimes( 2 )
        await rm( dir, { recursive: true, force: true } )
    } )
} )


describe( 'DataPretest optional throttle (PRD-2.3)', () => {
    test( 'throttleMs > 0 still fetches every test and clears the bar', async () => {
        const dir = await mkdtemp( join( tmpdir(), 'datapretest-throttle-' ) )
        const main = makeMainWithToolTests( { count: 2 } )
        fetchQueue = [ successFetch( { result: '1' } ), successFetch( { result: '2' } ) ]
        const started = Date.now()
        const out = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main, gradingDataDir: dir, throttleMs: 20 } )
        const elapsed = Date.now() - started
        expect( out.ok ).toBe( true )
        expect( fetchMock ).toHaveBeenCalledTimes( 2 )
        // one inter-fetch pause of 20ms applied between the two tests
        expect( elapsed ).toBeGreaterThanOrEqual( 18 )
        await rm( dir, { recursive: true, force: true } )
    } )
} )
