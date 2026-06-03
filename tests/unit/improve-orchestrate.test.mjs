import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    ImproveOrchestrate,
    IMPROVE_MANIFEST_FILENAME
} from '../../scripts/improve-orchestrate.mjs'


// All filesystem activity is confined to an OS temp dir created per test.
// NEVER writes to ~/.flowmcp or any user home (test isolation).
let tempRoot = null
const cliBin = '/dev/null/flowmcp-cli/src/index.mjs'


// A mocked CLI invoker returning a flat worklist per namespace — no live island.
const mockWorklistInvoker = ( { perNamespace } ) => {
    return async ( { namespace } ) => {
        const list = perNamespace[ namespace ] !== undefined ? perNamespace[ namespace ] : []
        return { status: true, json: list, stderr: '' }
    }
}


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'flowmcp-orchestrate-' ) )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
        tempRoot = null
    }
} )


describe( 'ImproveOrchestrate.plan — explicit namespaces', () => {
    test( 'missing namespaces is a coded error (no board default)', async () => {
        const result = await ImproveOrchestrate.plan( {
            namespaces: [],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( { perNamespace: {} } )
        } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => typeof e === 'string' && e.startsWith( 'ORC-001' ) ) ).toBe( true )
    } )

    test( 'a non-array namespaces value is a coded error', async () => {
        const result = await ImproveOrchestrate.plan( {
            namespaces: 'birdeye',
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( { perNamespace: {} } )
        } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => typeof e === 'string' && e.startsWith( 'ORC-001' ) ) ).toBe( true )
    } )
} )


describe( 'ImproveOrchestrate.plan — safe-path guard (FLEET-005 mirror)', () => {
    const unsafeBases = [ '/repo/src', '/repo/tests', '/repo/scripts', '/repo/docs', '/repo/prompts', '/repo/skills', '/repo/spec' ]

    unsafeBases.forEach( ( base ) => {
        test( `rejects out base "${base}"`, async () => {
            const result = await ImproveOrchestrate.plan( {
                namespaces: [ 'birdeye' ],
                outBase: base,
                gradingDataDir: tempRoot,
                cliBin,
                cliInvoker: mockWorklistInvoker( { perNamespace: { birdeye: [] } } )
            } )
            expect( result.status ).toBe( false )
            expect( result.errors.some( ( e ) => typeof e === 'string' && e.startsWith( 'ORC-005' ) ) ).toBe( true )
        } )
    } )

    test( 'accepts a safe island-style base', async () => {
        const result = await ImproveOrchestrate.plan( {
            namespaces: [ 'birdeye' ],
            outBase: join( tempRoot, 'grading-data' ),
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( { perNamespace: { birdeye: [ { namespace: 'birdeye', schema: 's', code: 'DPT-004', message: 'x' } ] } } )
        } )
        expect( result.status ).toBe( true )
        expect( result.entries[ 0 ].worklistCount ).toBe( 1 )
    } )
} )


describe( 'ImproveOrchestrate.plan — worklist collection', () => {
    test( 'builds a plan entry with worklist count, safe path and generator prompt', async () => {
        const result = await ImproveOrchestrate.plan( {
            namespaces: [ 'birdeye', 'etherscan' ],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( {
                perNamespace: {
                    birdeye: [ { namespace: 'birdeye', schema: 'a', code: 'DPT-004', message: 'fail' } ],
                    etherscan: []
                }
            } )
        } )
        expect( result.status ).toBe( true )
        expect( result.entries ).toHaveLength( 2 )

        const birdeye = result.entries.find( ( e ) => e.namespace === 'birdeye' )
        expect( birdeye.worklistCount ).toBe( 1 )
        expect( birdeye.generatorPrompt ).toBe( 'grading run birdeye --emit-prompts' )
        expect( birdeye.manifestPath.endsWith( join( 'improve', 'birdeye', IMPROVE_MANIFEST_FILENAME ) ) ).toBe( true )
    } )

    test( 'a CLI error object is collected, never swallowed', async () => {
        const errorInvoker = async ( { namespace } ) => {
            return { status: true, json: { error: 'WL-001: no prompts.json', fix: 'emit first' }, stderr: '' }
        }
        const result = await ImproveOrchestrate.plan( {
            namespaces: [ 'birdeye' ],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: errorInvoker
        } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ].errors.some( ( m ) => m.startsWith( 'ORC-022' ) ) ).toBe( true )
    } )

    test( 'a CLI invocation failure is collected as a coded error', async () => {
        const failInvoker = async () => {
            return { status: false, json: null, stderr: 'spawn ENOENT' }
        }
        const result = await ImproveOrchestrate.plan( {
            namespaces: [ 'birdeye' ],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: failInvoker
        } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ].errors.some( ( m ) => m.startsWith( 'ORC-020' ) ) ).toBe( true )
    } )
} )


describe( 'ImproveOrchestrate.run — dry-run vs write', () => {
    test( 'dry-run produces a plan without writing anything', async () => {
        const result = await ImproveOrchestrate.run( {
            namespaces: [ 'birdeye' ],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( { perNamespace: { birdeye: [] } } ),
            dryRun: true
        } )
        expect( result.status ).toBe( true )
        expect( result.entries ).toHaveLength( 1 )
        expect( result.written ).toEqual( [] )

        const manifestPath = result.entries[ 0 ].manifestPath
        let exists = true
        try {
            await readFile( manifestPath, 'utf-8' )
        } catch {
            exists = false
        }
        expect( exists ).toBe( false )
    } )

    test( 'write mode writes a manifest per namespace under the safe base', async () => {
        const result = await ImproveOrchestrate.run( {
            namespaces: [ 'birdeye' ],
            outBase: tempRoot,
            gradingDataDir: tempRoot,
            cliBin,
            cliInvoker: mockWorklistInvoker( { perNamespace: { birdeye: [ { namespace: 'birdeye', code: 'DPT-004', message: 'x' } ] } } ),
            dryRun: false
        } )
        expect( result.status ).toBe( true )
        expect( result.written ).toHaveLength( 1 )

        const onDisk = JSON.parse( await readFile( result.written[ 0 ], 'utf-8' ) )
        expect( onDisk.namespace ).toBe( 'birdeye' )
        expect( onDisk.worklistCount ).toBe( 1 )
        expect( onDisk.generatorPrompt ).toBe( 'grading run birdeye --emit-prompts' )
    } )
} )
