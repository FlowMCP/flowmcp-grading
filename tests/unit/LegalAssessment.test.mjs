import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    LegalAssessment,
    LEGAL_DISCLAIMER,
    NO_TOS_SENTINEL,
    LEGAL_STORAGE_FILENAME
} from '../../src/LegalAssessment.mjs'


// All filesystem activity is confined to an OS temp dir created per test.
// NEVER writes to ~/.flowmcp or any user home (test isolation).
let tempRoot = null


const validRecord = ( { namespace } ) => {
    return {
        namespace,
        assessedAt: '2026-06-03',
        disclaimer: LEGAL_DISCLAIMER,
        tosUrl: 'https://example.com/terms',
        robotsTxtStatus: 'green',
        usageCategory: 'open',
        notes: 'private note never published'
    }
}


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'flowmcp-legal-' ) )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
        tempRoot = null
    }
} )


describe( 'LegalAssessment.resolvePath', () => {
    test( 'resolves the island artifact path under gradingDataDir', () => {
        const result = LegalAssessment.resolvePath( { gradingDataDir: tempRoot } )
        expect( result.status ).toBe( true )
        expect( result.path ).toBe( join( tempRoot, LEGAL_STORAGE_FILENAME ) )
    } )

    test( 'rejects a missing gradingDataDir with a coded error', () => {
        const result = LegalAssessment.resolvePath( { gradingDataDir: null } )
        expect( result.status ).toBe( false )
        expect( result.messages[ 0 ] ).toMatch( /^LIC-001/ )
    } )
} )


describe( 'LegalAssessment.read — crate-before-use', () => {
    test( 'returns an empty skeleton when the file is absent (never throws)', async () => {
        const result = await LegalAssessment.read( { gradingDataDir: tempRoot } )
        expect( result.status ).toBe( true )
        expect( result.data ).toEqual( { schemaVersion: '1', entries: {} } )
    } )

    test( 'hard-errors on a corrupt file (no silent default)', async () => {
        await writeFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), '{ not json', 'utf-8' )
        const result = await LegalAssessment.read( { gradingDataDir: tempRoot } )
        expect( result.status ).toBe( false )
        expect( result.messages[ 0 ] ).toMatch( /^LIC-011/ )
    } )
} )


describe( 'LegalAssessment.validateRecord', () => {
    test( 'accepts a fully valid record', () => {
        const result = LegalAssessment.validateRecord( { record: validRecord( { namespace: 'birdeye' } ) } )
        expect( result.status ).toBe( true )
        expect( result.messages ).toEqual( [] )
    } )

    test( 'rejects a disclaimer mismatch verbatim', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.disclaimer = 'grader assessment'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-024' ) ) ).toBe( true )
    } )

    test( 'rejects an out-of-enum usageCategory', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.usageCategory = 'free-for-all'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-025' ) ) ).toBe( true )
    } )

    test( 'rejects an out-of-enum robotsTxtStatus', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.robotsTxtStatus = 'maybe'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-026' ) ) ).toBe( true )
    } )

    test( 'accepts the no-tos-found sentinel as tosUrl', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.tosUrl = NO_TOS_SENTINEL
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( true )
    } )

    test( 'accepts a https URL as tosUrl', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.tosUrl = 'https://provider.example/legal/tos'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( true )
    } )

    test( 'rejects a garbage tosUrl', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.tosUrl = 'not a url at all'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-027' ) ) ).toBe( true )
    } )

    test( 'rejects a non-ISO assessedAt', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.assessedAt = 'June 3rd 2026'
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-028' ) ) ).toBe( true )
    } )

    test( 'rejects a missing required field with a coded error', () => {
        const record = validRecord( { namespace: 'birdeye' } )
        delete record.tosUrl
        const result = LegalAssessment.validateRecord( { record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-022' ) ) ).toBe( true )
    } )
} )


describe( 'LegalAssessment.upsert — read-modify-write', () => {
    test( 'creates the artifact on first upsert and stores the record', async () => {
        const result = await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'birdeye' } ) } )
        expect( result.status ).toBe( true )

        const onDisk = JSON.parse( await readFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), 'utf-8' ) )
        expect( onDisk.schemaVersion ).toBe( '1' )
        expect( onDisk.entries.birdeye.usageCategory ).toBe( 'open' )
    } )

    test( 'reads-modifies-writes without clobbering a second namespace', async () => {
        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'birdeye' } ) } )
        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'etherscan' } ) } )

        const onDisk = JSON.parse( await readFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), 'utf-8' ) )
        expect( Object.keys( onDisk.entries ).sort() ).toEqual( [ 'birdeye', 'etherscan' ] )
    } )

    test( 'overwrites only the targeted namespace entry on re-upsert', async () => {
        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'birdeye' } ) } )
        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'etherscan' } ) } )

        const updated = validRecord( { namespace: 'birdeye' } )
        updated.usageCategory = 'restricted'
        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: updated } )

        const onDisk = JSON.parse( await readFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), 'utf-8' ) )
        expect( onDisk.entries.birdeye.usageCategory ).toBe( 'restricted' )
        expect( onDisk.entries.etherscan.usageCategory ).toBe( 'open' )
    } )

    test( 'rejects an invalid record before any write', async () => {
        const record = validRecord( { namespace: 'birdeye' } )
        record.disclaimer = 'wrong'
        const result = await LegalAssessment.upsert( { gradingDataDir: tempRoot, record } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'LIC-024' ) ) ).toBe( true )

        const read = await LegalAssessment.read( { gradingDataDir: tempRoot } )
        expect( read.data.entries ).toEqual( {} )
    } )

    test( 'preserves manually-seeded sibling entries (read-before-write)', async () => {
        await mkdir( tempRoot, { recursive: true } )
        const seeded = { schemaVersion: '1', entries: { preexisting: validRecord( { namespace: 'preexisting' } ) } }
        await writeFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), JSON.stringify( seeded, null, 4 ), 'utf-8' )

        await LegalAssessment.upsert( { gradingDataDir: tempRoot, record: validRecord( { namespace: 'birdeye' } ) } )

        const onDisk = JSON.parse( await readFile( join( tempRoot, LEGAL_STORAGE_FILENAME ), 'utf-8' ) )
        expect( Object.keys( onDisk.entries ).sort() ).toEqual( [ 'birdeye', 'preexisting' ] )
    } )
} )
