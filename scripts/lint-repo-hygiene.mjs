#!/usr/bin/env node
/**
 * lint-repo-hygiene.mjs — guards the public repo against two regressions:
 *
 *   1. Internal memo references  (e.g. "Memo 080", "memo-082", "Memo 76")
 *   2. Non-English content        (umlauts + a conservative German wordlist)
 *
 * Scope: shipped/public content (src, skills, prompts, docs, bin, scripts,
 * plus README.md and AGENTS.md). Internal test scaffolding (tests/) and
 * generated/transient dirs are out of scope.
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

const REPO_ROOT = join( fileURLToPath( import.meta.url ), '..', '..' )

const SCAN_DIRS = [ 'src', 'skills', 'prompts', 'docs', 'bin', 'scripts' ]
const SCAN_ROOT_FILES = [ 'README.md', 'AGENTS.md' ]
const SCAN_EXTENSIONS = [ '.md', '.mjs', '.json', '.mdx' ]

// Files/dirs excluded from the scan. The lint script itself is excluded
// because it intentionally contains a German wordlist.
const EXCLUDED_PATHS = [
    'scripts/lint-repo-hygiene.mjs'
]
const EXCLUDED_DIR_NAMES = [ 'node_modules', '.git', '.memo', 'grading-data', 'coverage', '.tmp' ]

const MEMO_REF_REGEX = /\bmemo[\s_-]?\d+/i

// Conservative German wordlist — distinctive words unlikely to collide with
// English. Ambiguous words (die, der, das, also, bin, war) are deliberately
// omitted to avoid false positives.
const GERMAN_WORDS = [
    'und', 'oder', 'nicht', 'werden', 'müssen', 'fuer', 'für', 'eine', 'keine',
    'wenn', 'dann', 'pruefung', 'prüfen', 'verbindlich', 'pflicht', 'beschreibung',
    'aenderung', 'änderung', 'soll', 'wird', 'sind', 'diese', 'dieser', 'quelle'
]
const GERMAN_WORD_REGEX = new RegExp( `\\b(${GERMAN_WORDS.join( '|' )})\\b`, 'i' )
const UMLAUT_REGEX = /[äöüÄÖÜß]/

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
