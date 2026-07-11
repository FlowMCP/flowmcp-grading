import { describe, test, expect } from '@jest/globals'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { GradingEmit } from '../../src/GradingEmit.mjs'
import { TaskId } from '../../src/TaskId.mjs'
import { VALID_AREAS } from '../../src/PromptBuilder.mjs'


// The grading emit-prompt textbau moved from the CLI
// into flowmcp-grading. These tests cover the pure, deterministic seams that the
// CLI bridge relies on. The full compositional output is additionally guarded by
// the byte-identical golden-fixture diff on the CLI side.
describe( 'GradingEmit — toRepoRelativePath', () => {
    test( 'absolute path under cwd -> repo-relative', () => {
        const cwd = '/tmp/repo'
        expect( GradingEmit.toRepoRelativePath( { cwd, path: '/tmp/repo/a/b.mjs' } ) ).toBe( join( 'a', 'b.mjs' ) )
    } )

    test( 'home path -> ~-anchored', () => {
        const home = homedir()
        expect( GradingEmit.toRepoRelativePath( { cwd: '/somewhere/else', path: `${home}/x.md` } ) ).toBe( '~/x.md' )
    } )

    test( 'non-absolute path returned as-is', () => {
        expect( GradingEmit.toRepoRelativePath( { cwd: '/tmp/repo', path: 'already/relative.mjs' } ) ).toBe( 'already/relative.mjs' )
    } )
} )


describe( 'GradingEmit — computeGradingTaskId', () => {
    test( 'empty emittable set -> status false (no silent taskId)', () => {
        const out = GradingEmit.computeGradingTaskId( { grading: { TaskId }, namespace: 'geo', emittedAreaSet: [] } )
        expect( out.status ).toBe( false )
        expect( out.taskId ).toBeUndefined()
    } )

    test( 'valid area set -> deterministic taskId', () => {
        const areas = [ VALID_AREAS[ 0 ] ]
        const out = GradingEmit.computeGradingTaskId( { grading: { TaskId }, namespace: 'geo', emittedAreaSet: areas } )
        expect( out.status ).toBe( true )
        expect( typeof out.taskId ).toBe( 'string' )
        // deterministic: same inputs -> same id
        const again = GradingEmit.computeGradingTaskId( { grading: { TaskId }, namespace: 'geo', emittedAreaSet: areas } )
        expect( again.taskId ).toBe( out.taskId )
    } )
} )
