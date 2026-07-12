import { describe, test, expect } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GRADING_SPEC_VERSION, GRADING_SPEC_REF_PREFIX } from '../../src/data/specVersion.mjs'


const HERE = dirname( fileURLToPath( import.meta.url ) )
const REPO_ROOT = join( HERE, '..', '..' )


describe( 'specVersion — single canonical grading-spec version (Befund E)', () => {
    test( 'exports the canonical version + ref prefix', () => {
        expect( GRADING_SPEC_VERSION ).toBe( '3.0.0' )
        expect( GRADING_SPEC_REF_PREFIX ).toBe( `flowmcp-spec/grading/${GRADING_SPEC_VERSION}` )
    } )

    test( 'no source comment or template references a drifted grading-spec version', () => {
        const scanRoots = [ 'src', 'prompts' ]
        const versionRegex = /\b(?:gradingSpec|grading)\/(\d+\.\d+\.\d+)/g

        const collect = ( dir ) => {
            const entries = readdirSync( join( REPO_ROOT, dir ), { withFileTypes: true, recursive: true } )
            return entries
                .filter( ( entry ) => entry.isFile() === true )
                .filter( ( entry ) => entry.name.endsWith( '.mjs' ) === true || entry.name.endsWith( '.md' ) === true )
                .map( ( entry ) => join( entry.parentPath ?? entry.path, entry.name ) )
        }

        const drift = scanRoots
            .flatMap( ( dir ) => collect( dir ) )
            .flatMap( ( file ) => {
                const text = readFileSync( file, 'utf-8' )
                const matches = [ ...text.matchAll( versionRegex ) ]
                return matches
                    .filter( ( match ) => match[ 1 ] !== GRADING_SPEC_VERSION )
                    .map( ( match ) => `${file}: ${match[ 0 ]}` )
            } )

        expect( drift ).toEqual( [] )
    } )
} )
