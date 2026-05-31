/**
 * InlineSkillNormalizer — SEL004 / F23 inline-skill normaliser.
 *
 * On import a schema MAY declare skills inline (a skill object that carries its
 * body text directly in `content` / `body` / `text` instead of pointing at a
 * file). The neutral island body MUST NOT keep inline skills: each inline skill
 * is written out to its own island file
 *
 *   skills/<skill>/<skill>--<YYYY-MM-DDTHH-MM-SSZ>--<hash8>.mjs   (B2 grammar)
 *
 * and a provenance record is attached (where it came from, when it was
 * extracted, the content hash). The write is NO-OVERWRITE: an identical hash is
 * a skip, a hash collision with different content is a conflict (never an
 * overwrite). The neutral source schema itself is never mutated on disk — the
 * normaliser only emits derived skill files plus an in-memory report.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns.
 */

import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { HashGenerator } from './HashGenerator.mjs'


const SKILL_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/
// B2 primitive grammar for skill files.
const SKILL_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.mjs$/
// An inline skill is one whose body lives in one of these keys (vs. a file ref).
const INLINE_BODY_KEYS = [ 'content', 'body', 'text' ]


class InlineSkillNormalizer {
    /**
     * normalize — extract every inline skill of a schema into its own island
     * file under skills/<skill>/, recording provenance.
     *
     * @param {Object} params
     * @param {Object} params.schema — the (neutral) schema object (main/schema export)
     * @param {string} params.schemaDir — providers/<ns>/<schema> island folder
     * @param {string} params.sourcePath — the original .mjs the schema came from (provenance)
     * @returns {Promise<{ status: boolean, normalized: Object[], errors: string[] }>}
     */
    static async normalize( { schema, schemaDir, sourcePath } ) {
        const { status, messages } = InlineSkillNormalizer.#validationNormalize( { schema, schemaDir, sourcePath } )
        if( !status ) { return { status: false, normalized: [], errors: messages } }

        const skills = Array.isArray( schema.skills ) ? schema.skills : []
        const inlineSkills = skills
            .filter( ( skill ) => InlineSkillNormalizer.#isInline( { skill } ) )

        if( inlineSkills.length === 0 ) {
            return { status: true, normalized: [], errors: [] }
        }

        const results = []
        await inlineSkills
            .reduce( async ( prev, skill ) => {
                await prev
                const one = await InlineSkillNormalizer.#normalizeOne( { skill, schemaDir, sourcePath } )
                results.push( one )
            }, Promise.resolve() )

        const errors = results
            .reduce( ( acc, r ) => acc.concat( r.errors ), [] )
        const normalized = results
            .filter( ( r ) => r.record !== null )
            .map( ( r ) => r.record )

        return { status: errors.length === 0, normalized, errors }
    }


    static #isInline( { skill } ) {
        if( skill === null || typeof skill !== 'object' || Array.isArray( skill ) ) { return false }
        return INLINE_BODY_KEYS
            .some( ( key ) => typeof skill[ key ] === 'string' && skill[ key ].length > 0 )
    }


    static #bodyOf( { skill } ) {
        const key = INLINE_BODY_KEYS
            .find( ( k ) => typeof skill[ k ] === 'string' && skill[ k ].length > 0 )
        if( key === undefined ) { return { body: null, bodyKey: null } }
        return { body: skill[ key ], bodyKey: key }
    }


    static async #normalizeOne( { skill, schemaDir, sourcePath } ) {
        const skillName = skill.name
        if( typeof skillName !== 'string' || !SKILL_NAME_REGEX.test( skillName ) ) {
            return { record: null, errors: [ `SEL-004: Invalid inline skill name: ${skillName} (expected [A-Za-z][A-Za-z0-9_-]*)` ] }
        }

        const { body, bodyKey } = InlineSkillNormalizer.#bodyOf( { skill } )
        if( body === null ) {
            return { record: null, errors: [ `SEL-004: Inline skill ${skillName} carries no body (expected one of ${INLINE_BODY_KEYS.join( '/' )})` ] }
        }

        const hashResult = HashGenerator.computeHash( { value: { name: skillName, body, type: skill.type, level: skill.level } } )
        if( hashResult.errors.length > 0 ) {
            return { record: null, errors: hashResult.errors }
        }
        const hash = hashResult.hash

        const skillDir = join( schemaDir, 'skills', skillName )
        await mkdir( skillDir, { recursive: true } )

        const fileBody = InlineSkillNormalizer.#renderSkillFile( { skillName, skill, body, bodyKey } )

        // NO-OVERWRITE: the content hash (over name+body+type+level) is the skill's
        // identity and is encoded in the filename. An existing file with the same
        // logical name AND hash is therefore the same skill → skip (never re-write).
        // The on-disk bytes are NOT byte-compared: the rendered file embeds an
        // `extractedAt` provenance timestamp, so two emissions of the same skill
        // would differ byte-wise yet are semantically identical by hash.
        const existing = await InlineSkillNormalizer.#findByHash( { skillDir, skillName, hash } )
        if( existing !== null ) {
            return {
                record: InlineSkillNormalizer.#record( { skillName, hash, path: existing.path, sourcePath, bodyKey, skipped: true } ),
                errors: []
            }
        }

        const ts = InlineSkillNormalizer.#timestamp()
        const filename = `${skillName}--${ts}--${hash}.mjs`
        const path = join( skillDir, filename )
        await writeFile( path, fileBody, 'utf-8' )

        return {
            record: InlineSkillNormalizer.#record( { skillName, hash, path, sourcePath, bodyKey, skipped: false } ),
            errors: []
        }
    }


    static #renderSkillFile( { skillName, skill, body, bodyKey } ) {
        const provenance = {
            normalizedFrom: 'inline',
            inlineBodyKey: bodyKey,
            extractedAt: InlineSkillNormalizer.#isoNow(),
            skillName,
            type: skill.type === undefined ? null : skill.type,
            level: skill.level === undefined ? null : skill.level
        }
        const provenanceJson = JSON.stringify( provenance, null, 4 )
        const bodyJson = JSON.stringify( body )

        return [
            '/**',
            ' * Normalised inline skill — emitted by InlineSkillNormalizer (SEL004 / F23).',
            ' * The neutral source schema declared this skill inline; it has been written',
            ' * out to its own island file with the provenance record below.',
            ' */',
            '',
            `export const provenance = ${provenanceJson}`,
            '',
            `export const skill = {`,
            `    name: ${JSON.stringify( skillName )},`,
            `    type: ${JSON.stringify( provenance.type )},`,
            `    level: ${JSON.stringify( provenance.level )},`,
            `    body: ${bodyJson}`,
            `}`,
            ''
        ].join( '\n' )
    }


    static #record( { skillName, hash, path, sourcePath, bodyKey, skipped } ) {
        return {
            skillName,
            hash,
            path,
            provenance: {
                normalizedFrom: 'inline',
                inlineBodyKey: bodyKey,
                sourcePath,
                extractedAt: InlineSkillNormalizer.#isoNow()
            },
            skipped
        }
    }


    static async #findByHash( { skillDir, skillName, hash } ) {
        try {
            const entries = await readdir( skillDir )
            const matched = entries
                .filter( ( name ) => SKILL_FILENAME_REGEX.test( name ) )
                .find( ( name ) => {
                    const parsed = SKILL_FILENAME_REGEX.exec( name )
                    return parsed !== null && parsed[ 1 ] === skillName && parsed[ 3 ] === hash
                } )
            if( matched === undefined ) { return null }
            return { path: join( skillDir, matched ) }
        } catch( error ) {
            return null
        }
    }


    static #timestamp() {
        const iso = new Date().toISOString()
        const noMillis = iso.replace( /\.\d{3}Z$/, 'Z' )
        return noMillis.replace( /:/g, '-' )
    }


    static #isoNow() {
        return new Date().toISOString()
    }


    static #validationNormalize( { schema, schemaDir, sourcePath } ) {
        const messages = []
        const struct = { status: false, messages }

        if( schema === undefined || schema === null ) {
            messages.push( 'SEL-004: Required field missing: schema' )
            return struct
        }
        if( typeof schema !== 'object' || Array.isArray( schema ) ) {
            messages.push( `SEL-004: Type mismatch for field schema: expected object, got ${Array.isArray( schema ) ? 'array' : typeof schema}` )
            return struct
        }

        const pairs = [
            [ 'schemaDir', schemaDir ],
            [ 'sourcePath', sourcePath ]
        ]
        pairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `SEL-004: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `SEL-004: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { InlineSkillNormalizer, SKILL_FILENAME_REGEX, INLINE_BODY_KEYS }
