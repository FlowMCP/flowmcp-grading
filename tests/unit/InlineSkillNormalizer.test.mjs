import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, mkdir, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InlineSkillNormalizer } from '../../src/InlineSkillNormalizer.mjs'


// Isolated temp dir per test. NEVER writes to ~/.flowmcp or any user home.
let tempRoot = null
let schemaDir = null


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'inline-skill-' ) )
    schemaDir = join( tempRoot, 'providers', 'etherscan', 'getA' )
    await mkdir( schemaDir, { recursive: true } )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'InlineSkillNormalizer.normalize', () => {
    test( 'extracts an inline skill into skills/<skill>/ with provenance', async () => {
        const schema = {
            namespace: 'etherscan',
            name: 'getA',
            skills: [ { name: 'priceEntry', type: 'namespace', level: null, content: 'body text' } ]
        }
        const result = await InlineSkillNormalizer.normalize( { schema, schemaDir, sourcePath: '/src/getA.mjs' } )
        expect( result.status ).toBe( true )
        expect( result.normalized.length ).toBe( 1 )
        expect( result.normalized[ 0 ].provenance.normalizedFrom ).toBe( 'inline' )
        expect( result.normalized[ 0 ].provenance.sourcePath ).toBe( '/src/getA.mjs' )

        const skillDir = join( schemaDir, 'skills', 'priceEntry' )
        const files = await readdir( skillDir )
        expect( files.length ).toBe( 1 )
        expect( files[ 0 ] ).toMatch( /^priceEntry--.+--[0-9a-f]{8}\.mjs$/ )
    } )

    test( 'file-referenced skills (no inline body) are left alone', async () => {
        const schema = {
            namespace: 'etherscan',
            name: 'getA',
            skills: [ { name: 'priceEntry', type: 'namespace', file: './skills/priceEntry.mjs' } ]
        }
        const result = await InlineSkillNormalizer.normalize( { schema, schemaDir, sourcePath: '/src/getA.mjs' } )
        expect( result.status ).toBe( true )
        expect( result.normalized.length ).toBe( 0 )
    } )

    test( 'identical hash on a re-run → skip (no second file, no overwrite)', async () => {
        const schema = {
            namespace: 'etherscan',
            name: 'getA',
            skills: [ { name: 'priceEntry', type: 'namespace', level: null, content: 'body text' } ]
        }
        await InlineSkillNormalizer.normalize( { schema, schemaDir, sourcePath: '/src/getA.mjs' } )
        const skillDir = join( schemaDir, 'skills', 'priceEntry' )
        const before = await readdir( skillDir )

        const second = await InlineSkillNormalizer.normalize( { schema, schemaDir, sourcePath: '/src/getA.mjs' } )
        expect( second.status ).toBe( true )
        expect( second.normalized[ 0 ].skipped ).toBe( true )
        const after = await readdir( skillDir )
        expect( after ).toEqual( before )
    } )

    test( 'an inline skill with an invalid name yields SEL-004', async () => {
        const schema = {
            namespace: 'etherscan',
            name: 'getA',
            skills: [ { name: '1-bad name', type: 'namespace', content: 'body' } ]
        }
        const result = await InlineSkillNormalizer.normalize( { schema, schemaDir, sourcePath: '/src/getA.mjs' } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'SEL-004' )
    } )

    test( 'missing schema yields SEL-004', async () => {
        const result = await InlineSkillNormalizer.normalize( { schemaDir, sourcePath: '/src/getA.mjs' } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'SEL-004' )
    } )
} )
