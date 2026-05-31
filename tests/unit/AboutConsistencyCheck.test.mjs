import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AboutConsistencyCheck } from '../../src/AboutConsistencyCheck.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null


// v2 layout: providers/<ns>/<schema>/schema/<name>--<ts>--<hash>.mjs and the
// About Resource at providers/<ns>/<schema>/resources/about/ (namespace-wide).
const seedNamespace = async ( { namespace, tools, aboutText } ) => {
    const root = join( tempRoot, 'ab', namespace )
    const schemaName = 'demo'
    const schemaDir = join( root, 'providers', namespace, schemaName, 'schema' )
    const aboutDir = join( root, 'providers', namespace, schemaName, 'resources', 'about' )
    await mkdir( schemaDir, { recursive: true } )
    await mkdir( aboutDir, { recursive: true } )

    const schemaObject = {
        version: 'flowmcp/4.0.0',
        namespace,
        name: schemaName,
        tools
    }
    const hashResult = HashGenerator.computeSchemaHash( { schema: schemaObject } )
    const filename = `${schemaName}--2026-05-30T10-15-00Z--${hashResult.hash}.mjs`
    const fileSource = `export const main = ${JSON.stringify( schemaObject )}`
    await writeFile( join( schemaDir, filename ), fileSource, 'utf-8' )

    await writeFile( join( aboutDir, `${schemaName}-about--2026-05-30T10-15-00Z--aaaaaaaa.md` ), aboutText, 'utf-8' )
    return root
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'about-consistency-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'AboutConsistencyCheck.checkNamespaceAbout', () => {
    test( 'about-text covers all tools → passed', async () => {
        const root = await seedNamespace( {
            namespace: 'demo1',
            tools: {
                getThing: { method: 'GET', path: '/thing', description: 'Fetch a thing by identifier with detailed metadata' }
            },
            aboutText: '# Demo1\n\nThis page documents the getThing tool. It fetches things by identifier with metadata.'
        } )
        const r = await AboutConsistencyCheck.checkNamespaceAbout( { gradingDataRoot: root, namespace: 'demo1' } )
        expect( r.passed ).toBe( true )
    } )

    test( 'missing tool name → ABT-004', async () => {
        const root = await seedNamespace( {
            namespace: 'demo2',
            tools: {
                getThing: { method: 'GET', path: '/thing', description: 'Fetch a thing' },
                getOther: { method: 'GET', path: '/other', description: 'Fetch other' }
            },
            aboutText: 'Only mentions getThing.'
        } )
        const r = await AboutConsistencyCheck.checkNamespaceAbout( { gradingDataRoot: root, namespace: 'demo2' } )
        expect( r.passed ).toBe( false )
        const has = r.issues.some( ( i ) => i.code === 'ABT-004' && i.message.includes( 'getOther' ) )
        expect( has ).toBe( true )
    } )

    test( 'low description overlap → ABT-WARN-001 (does not fail)', async () => {
        const root = await seedNamespace( {
            namespace: 'demo3',
            tools: {
                getThing: { method: 'GET', path: '/thing', description: 'Aggregates blockchain transaction history metadata identifiers from explorer service' }
            },
            aboutText: 'getThing exists.'
        } )
        const r = await AboutConsistencyCheck.checkNamespaceAbout( { gradingDataRoot: root, namespace: 'demo3' } )
        const has = r.issues.some( ( i ) => i.code === 'ABT-WARN-001' )
        expect( has ).toBe( true )
    } )

    test( 'missing namespace yields ABT-001', async () => {
        const r = await AboutConsistencyCheck.checkNamespaceAbout( { gradingDataRoot: tempRoot } )
        expect( r.errors[ 0 ] ).toContain( 'ABT-001' )
    } )
} )


describe( 'AboutConsistencyCheck.verifyNamespace', () => {
    test( 'without lockfile → only Step 1 (consistency) runs', async () => {
        const root = await seedNamespace( {
            namespace: 'verifyok',
            tools: { getThing: { method: 'GET', path: '/x', description: 'Get thing' } },
            aboutText: 'getThing returns a thing.'
        } )
        const r = await AboutConsistencyCheck.verifyNamespace( { gradingDataRoot: root, namespace: 'verifyok' } )
        expect( r.preConditionPassed ).toBe( true )
        expect( r.verified ).toBe( true )
    } )
} )
