/**
 * LegalAssessment — the private creator legal-assessment island artifact.
 *
 * License assessment is a PRIVATE creator opinion, kept inside the island
 * (the gitignored grading-data tree) and NEVER added as a public schema field
 * nor merged into the committed grade.json. The committed proof carries no
 * legal fields whatsoever — this class only touches `licenses-internal.json`.
 *
 * Storage shape (top level):
 *   { schemaVersion: '1', entries: { <namespace>: <record>, ... } }
 *
 * crate-before-use: the file does NOT need to exist. read() returns an empty
 * skeleton on absence (never throws); upsert() reads the existing file FIRST,
 * mutates only the one namespace entry, then writes back atomically (tmp +
 * rename) — it NEVER blind-overwrites the whole file.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns. No spread, no for/while, async/await, English only.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'


const STORAGE_FILENAME = 'licenses-internal.json'
const STORAGE_SCHEMA_VERSION = '1'

// Verbatim disclaimer constant — every record MUST carry exactly this string.
// No variation, no abbreviation.
const LEGAL_DISCLAIMER = 'grader assessment, not legally binding'

// Sentinel accepted in place of a tosUrl when no terms-of-service page exists.
const NO_TOS_SENTINEL = 'no-tos-found'

const USAGE_CATEGORIES = [ 'open', 'restricted', 'commercial-ok', 'commercial-restricted', 'unknown' ]
const ROBOTS_TXT_STATUSES = [ 'green', 'yellow', 'red', 'unchecked' ]

const REQUIRED_FIELDS = [ 'namespace', 'assessedAt', 'disclaimer', 'tosUrl', 'robotsTxtStatus', 'usageCategory' ]

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/


class LegalAssessment {
    /**
     * resolvePath — the island location of the license artifact.
     *
     * @param {Object} params
     * @param {string} params.gradingDataDir — island root (grading-data tree)
     * @returns {{ status, path, messages }}
     */
    static resolvePath( { gradingDataDir } ) {
        const messages = []

        if( gradingDataDir === undefined || gradingDataDir === null ) {
            messages.push( 'LIC-001: Required field missing: gradingDataDir' )
        } else if( typeof gradingDataDir !== 'string' ) {
            messages.push( `LIC-002: Type mismatch for field gradingDataDir: expected string, got ${typeof gradingDataDir}` )
        } else if( gradingDataDir.length === 0 ) {
            messages.push( 'LIC-003: Empty field: gradingDataDir must be a non-empty string' )
        }

        if( messages.length > 0 ) { return { status: false, path: null, messages } }

        const path = join( gradingDataDir, STORAGE_FILENAME )

        return { status: true, path, messages: [] }
    }


    /**
     * read — crate-before-use: a missing file returns the empty skeleton instead
     * of throwing. A present-but-corrupt file is a hard error (NO SILENT
     * DEFAULTS — never silently discard an unreadable artifact).
     *
     * @param {Object} params
     * @param {string} params.gradingDataDir — island root (grading-data tree)
     * @returns {Promise<{ status, data, messages }>}
     */
    static async read( { gradingDataDir } ) {
        const resolved = LegalAssessment.resolvePath( { gradingDataDir } )
        if( !resolved.status ) { return { status: false, data: null, messages: resolved.messages } }

        const { path } = resolved

        let content = null
        try {
            content = await readFile( path, 'utf-8' )
        } catch( ioError ) {
            if( ioError.code === 'ENOENT' ) {
                return { status: true, data: { schemaVersion: STORAGE_SCHEMA_VERSION, entries: {} }, messages: [] }
            }
            return { status: false, data: null, messages: [ `LIC-010: cannot read ${path}: ${ioError.message}` ] }
        }

        let parsed = null
        try {
            parsed = JSON.parse( content )
        } catch( parseError ) {
            return { status: false, data: null, messages: [ `LIC-011: ${path} is not valid JSON: ${parseError.message}` ] }
        }

        const normalized = LegalAssessment.#normalizeStore( { parsed } )

        return { status: true, data: normalized, messages: [] }
    }


    /**
     * validateRecord — enforce the closed legalAssessment shape. Returns a status
     * plus a coded messages[] array; never throws, never defaults a bad value.
     *
     * @param {Object} params
     * @param {Object} params.record — the legalAssessment record to validate
     * @returns {{ status, messages }}
     */
    static validateRecord( { record } ) {
        const messages = []

        if( record === undefined || record === null ) {
            messages.push( 'LIC-020: Required field missing: record' )
            return { status: false, messages }
        }
        if( typeof record !== 'object' || Array.isArray( record ) ) {
            messages.push( `LIC-021: Type mismatch for field record: expected object, got ${Array.isArray( record ) ? 'array' : typeof record}` )
            return { status: false, messages }
        }

        REQUIRED_FIELDS
            .forEach( ( field ) => {
                if( record[ field ] === undefined || record[ field ] === null ) {
                    messages.push( `LIC-022: Required field missing: record.${field}` )
                }
            } )
        if( messages.length > 0 ) { return { status: false, messages } }

        if( typeof record.namespace !== 'string' || record.namespace.length === 0 ) {
            messages.push( 'LIC-023: record.namespace must be a non-empty string' )
        }

        if( record.disclaimer !== LEGAL_DISCLAIMER ) {
            messages.push( `LIC-024: record.disclaimer must be exactly "${LEGAL_DISCLAIMER}" (verbatim, no variation)` )
        }

        if( !USAGE_CATEGORIES.includes( record.usageCategory ) ) {
            messages.push( `LIC-025: record.usageCategory must be one of [${USAGE_CATEGORIES.join( ', ' )}], got "${record.usageCategory}"` )
        }

        if( !ROBOTS_TXT_STATUSES.includes( record.robotsTxtStatus ) ) {
            messages.push( `LIC-026: record.robotsTxtStatus must be one of [${ROBOTS_TXT_STATUSES.join( ', ' )}], got "${record.robotsTxtStatus}"` )
        }

        const tosCheck = LegalAssessment.#validateTosUrl( { tosUrl: record.tosUrl } )
        tosCheck.messages
            .forEach( ( message ) => messages.push( message ) )

        if( typeof record.assessedAt !== 'string' || ISO_DATE_REGEX.test( record.assessedAt ) === false ) {
            messages.push( `LIC-028: record.assessedAt must be an ISO 8601 date (YYYY-MM-DD), got "${record.assessedAt}"` )
        }

        if( messages.length > 0 ) { return { status: false, messages } }

        return { status: true, messages: [] }
    }


    /**
     * upsert — validate the record, then read-modify-write the island file. The
     * existing file is ALWAYS read first; only entries[record.namespace] is set;
     * every other namespace entry is preserved. Write is atomic (tmp + rename).
     * Never writes into grade.json or any public schema.
     *
     * @param {Object} params
     * @param {string} params.gradingDataDir — island root (grading-data tree)
     * @param {Object} params.record — the legalAssessment record to store
     * @returns {Promise<{ status, path, data, messages }>}
     */
    static async upsert( { gradingDataDir, record } ) {
        const validation = LegalAssessment.validateRecord( { record } )
        if( !validation.status ) { return { status: false, path: null, data: null, messages: validation.messages } }

        const resolved = LegalAssessment.resolvePath( { gradingDataDir } )
        if( !resolved.status ) { return { status: false, path: null, data: null, messages: resolved.messages } }

        const { path } = resolved

        // crate-before-use: read existing entries FIRST, never blind-overwrite.
        const existing = await LegalAssessment.read( { gradingDataDir } )
        if( !existing.status ) { return { status: false, path, data: null, messages: existing.messages } }

        const nextEntries = Object.entries( existing.data.entries )
            .reduce( ( acc, [ namespace, value ] ) => {
                acc[ namespace ] = value
                return acc
            }, {} )
        nextEntries[ record.namespace ] = record

        const nextStore = { schemaVersion: STORAGE_SCHEMA_VERSION, entries: nextEntries }

        const written = await LegalAssessment.#writeAtomic( { path, store: nextStore } )
        if( written.messages.length > 0 ) { return { status: false, path, data: null, messages: written.messages } }

        return { status: true, path, data: nextStore, messages: [] }
    }


    // ---- internal -----------------------------------------------------------

    static #normalizeStore( { parsed } ) {
        const isObject = parsed !== null && typeof parsed === 'object' && Array.isArray( parsed ) === false
        const schemaVersion = isObject === true && typeof parsed.schemaVersion === 'string'
            ? parsed.schemaVersion
            : STORAGE_SCHEMA_VERSION
        const entries = isObject === true && parsed.entries !== null && typeof parsed.entries === 'object' && Array.isArray( parsed.entries ) === false
            ? parsed.entries
            : {}

        return { schemaVersion, entries }
    }


    static #validateTosUrl( { tosUrl } ) {
        const messages = []

        if( typeof tosUrl !== 'string' || tosUrl.length === 0 ) {
            messages.push( 'LIC-027: record.tosUrl must be a non-empty string (a URL or the "no-tos-found" sentinel)' )
            return { messages }
        }
        if( tosUrl === NO_TOS_SENTINEL ) { return { messages } }

        let valid = false
        try {
            const parsedUrl = new URL( tosUrl )
            valid = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
        } catch( urlError ) {
            valid = false
        }
        if( valid === false ) {
            messages.push( `LIC-027: record.tosUrl must be an http(s) URL or the "${NO_TOS_SENTINEL}" sentinel, got "${tosUrl}"` )
        }

        return { messages }
    }


    static async #writeAtomic( { path, store } ) {
        try {
            await mkdir( join( path, '..' ), { recursive: true } )
            const tmpPath = `${path}.tmp-${process.pid}`
            await writeFile( tmpPath, JSON.stringify( store, null, 4 ), 'utf-8' )
            await rename( tmpPath, path )
            return { messages: [] }
        } catch( error ) {
            return { messages: [ `LIC-012: license artifact write failed: ${error.message}` ] }
        }
    }
}


export {
    LegalAssessment,
    LEGAL_DISCLAIMER,
    NO_TOS_SENTINEL,
    STORAGE_FILENAME as LEGAL_STORAGE_FILENAME,
    STORAGE_SCHEMA_VERSION as LEGAL_STORAGE_SCHEMA_VERSION
}
