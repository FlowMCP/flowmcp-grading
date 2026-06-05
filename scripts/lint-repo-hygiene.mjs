#!/usr/bin/env node
/**
 * lint-repo-hygiene.mjs — guards the public repo against two regressions:
 *
 *   1. Internal memo references  (the literal word "memo" followed by a number)
 *   2. Non-English content        (umlauts + a conservative non-English wordlist)
 *
 * Scope: src, skills, prompts, docs, bin, scripts, tests, plus README.md and
 * AGENTS.md. Generated/transient dirs (node_modules, grading-data, coverage,
 * .tmp) and underscore-prefixed scratch files are out of scope. This detector
 * file is self-excluded because it intentionally carries the pattern wordlist.
 *
 * The non-English check is a HEURISTIC, not a guarantee: it catches umlauts
 * and a small set of distinctive German function words. It will not detect
 * every possible non-English string, but it reliably catches accidental
 * German prose reintroduced into the repo.
 *
 * Usage:
 *   node scripts/lint-repo-hygiene.mjs            # scan, exit 1 on findings
 *   node scripts/lint-repo-hygiene.mjs --verbose  # also print scanned count
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = internal error.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GRADING_SPEC_VERSION } from '../src/data/specVersion.mjs'

const REPO_ROOT = join( fileURLToPath( import.meta.url ), '..', '..' )

const SCAN_DIRS = [ 'src', 'prompts', 'docs', 'bin', 'scripts', 'tests' ]
const SCAN_ROOT_FILES = [ 'README.md', 'AGENTS.md' ]
const SCAN_EXTENSIONS = [ '.md', '.mjs', '.json', '.mdx' ]

// Files/dirs excluded from the scan. The lint script itself is excluded
// because it intentionally contains a German wordlist.
const EXCLUDED_PATHS = [
    'scripts/lint-repo-hygiene.mjs'
]
const EXCLUDED_DIR_NAMES = [ 'node_modules', '.git', '.memo', 'grading-data', 'coverage', '.tmp' ]

const MEMO_REF_REGEX = /\bmemo[\s_-]?\d+/i

// Stale grading-spec-version guard (Befund E, F4 single-source): any
// `gradingSpec/<x.y.z>` or `grading/<x.y.z>` literal whose version differs from
// the single canonical GRADING_SPEC_VERSION is drift and fails the lint. The
// version source is data/specVersion.mjs — change it there, not in scattered
// literals. Historical version axes (15-versioning) and CHANGELOG migration
// notes are out of scope (markdown under docs is allowed to cite older specs).
const SPEC_VERSION_REGEX = /\b(?:gradingSpec|grading)\/(\d+\.\d+\.\d+)/g

// Conservative non-English wordlist — distinctive words unlikely to collide
// with English. Ambiguous words (die, der, das, also, bin, war) are
// deliberately omitted to avoid false positives. Words carrying diacritics
// are written with unicode escapes so this detector file stays byte-clean.
const GERMAN_WORDS = [
    'und', 'oder', 'nicht', 'werden', 'm\u00fcssen', 'fuer', 'f\u00fcr', 'eine', 'keine',
    'wenn', 'dann', 'pruefung', 'pr\u00fcfen', 'verbindlich', 'pflicht', 'beschreibung',
    'aenderung', '\u00e4nderung', 'soll', 'wird', 'sind', 'diese', 'dieser', 'quelle'
]
const GERMAN_WORD_REGEX = new RegExp( `\\b(${GERMAN_WORDS.join( '|' )})\\b`, 'i' )
const UMLAUT_REGEX = /[\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]/

const collectFiles = ( { dir } ) => {
    const abs = join( REPO_ROOT, dir )
    const exists = ( () => {
        try { return statSync( abs ).isDirectory() }
        catch { return false }
    } )()
    if( exists === false ) { return [] }

    const entries = readdirSync( abs, { withFileTypes: true, recursive: true } )
    const files = entries
        .filter( ( entry ) => entry.isFile() )
        .filter( ( entry ) => SCAN_EXTENSIONS.some( ( ext ) => entry.name.endsWith( ext ) ) )
        .map( ( entry ) => join( entry.parentPath ?? entry.path, entry.name ) )
        .filter( ( full ) => EXCLUDED_DIR_NAMES.every( ( name ) => relative( REPO_ROOT, full ).split( '/' ).includes( name ) === false ) )
        .filter( ( full ) => basename( full ).startsWith( '_' ) === false )
        .filter( ( full ) => EXCLUDED_PATHS.includes( relative( REPO_ROOT, full ) ) === false )

    return files
}

const scanFile = ( { file } ) => {
    const rel = relative( REPO_ROOT, file )
    const lines = readFileSync( file, 'utf-8' ).split( '\n' )

    // The spec-version drift guard binds only to the surfaces that drifted in
    // Befund E — source comments and prompt templates. Docs (versioning axes,
    // CHANGELOG migration notes) legitimately cite older spec versions.
    const versionGuarded = rel.startsWith( 'src/' ) === true || rel.startsWith( 'prompts/' ) === true

    const findings = lines.flatMap( ( line, idx ) => {
        const lineNo = idx + 1
        const hits = []
        if( MEMO_REF_REGEX.test( line ) === true ) {
            hits.push( { rel, lineNo, kind: 'memo-ref', text: line.trim().slice( 0, 100 ) } )
        }
        const hasUmlaut = UMLAUT_REGEX.test( line )
        const hasGermanWord = GERMAN_WORD_REGEX.test( line )
        if( hasUmlaut === true || hasGermanWord === true ) {
            hits.push( { rel, lineNo, kind: 'non-english', text: line.trim().slice( 0, 100 ) } )
        }
        if( versionGuarded === true ) {
            const matches = [ ...line.matchAll( SPEC_VERSION_REGEX ) ]
            matches
                .filter( ( match ) => match[ 1 ] !== GRADING_SPEC_VERSION )
                .forEach( ( match ) => {
                    hits.push( { rel, lineNo, kind: 'spec-version-drift', text: `${match[ 0 ]} != canonical ${GRADING_SPEC_VERSION}` } )
                } )
        }
        return hits
    } )

    return findings
}

const run = () => {
    const verbose = process.argv.includes( '--verbose' )

    const rootFiles = SCAN_ROOT_FILES
        .map( ( name ) => join( REPO_ROOT, name ) )
        .filter( ( full ) => {
            try { return statSync( full ).isFile() }
            catch { return false }
        } )
    const dirFiles = SCAN_DIRS.flatMap( ( dir ) => collectFiles( { dir } ) )
    const allFiles = [ ...rootFiles, ...dirFiles ]

    const findings = allFiles.flatMap( ( file ) => scanFile( { file } ) )

    if( verbose === true ) {
        console.log( `Scanned ${allFiles.length} files across ${SCAN_DIRS.join( ', ' )} + root docs.` )
    }

    if( findings.length === 0 ) {
        console.log( 'repo-hygiene: PASS — no internal memo references, no non-English content.' )
        return { exitCode: 0 }
    }

    console.error( `repo-hygiene: FAIL — ${findings.length} finding(s):\n` )
    findings.forEach( ( finding ) => {
        const { rel, lineNo, kind, text } = finding
        console.error( `  [${kind}] ${rel}:${lineNo}  ${text}` )
    } )
    console.error( '\nFix: translate non-English content to English and replace internal' )
    console.error( 'memo references with stable concept terms or grading-spec references.' )
    return { exitCode: 1 }
}

const { exitCode } = run()
process.exit( exitCode )
