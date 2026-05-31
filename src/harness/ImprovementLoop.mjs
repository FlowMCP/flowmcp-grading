/**
 * ImprovementLoop — the self-improvement engine (Memo 087, Kap 5/6).
 *
 * Loop: test all areas -> pick the lowest (floor lever: a 1->4 jump beats 4->5)
 * -> apply an improvement -> re-test. Three stop conditions, ANY of which ends
 * the loop (abort is a legitimate outcome — never "pass at any cost", Kap 1):
 *
 *   - round-limit  : the non-negotiable deterministic backstop.
 *   - token-budget : deterministic; spentFn() >= tokenBudget.
 *   - plateau      : non-deterministic add-on; the floor score did not improve
 *                    by more than `epsilon` across the last `rounds` rounds.
 *
 * Floor-lever tie-break within the same score: tools < schema < provider
 * (Kap 8: within the ordering Tools -> Schema -> Provider).
 *
 * Engine only — the actual scoring + improving are caller-supplied callbacks
 * (production: AreaScorer + a schema-fix step; tests: mocks). NO LLM calls here.
 *
 * NO `for`/`while` (CLAUDE.md) — recursion + array methods. NO SILENT DEFAULTS.
 * Static methods, object params, object returns.
 */

const LEVEL_ORDER = Object.freeze( { tool: 0, schema: 1, provider: 2 } )
const STOP_REASONS = Object.freeze( [ 'round-limit', 'token-budget', 'plateau' ] )


class ImprovementLoop {
    /**
     * @param {Object}   params
     * @param {Object[]} params.areas        — [{ id, level: 'tool'|'schema'|'provider' }]
     * @param {Function} params.scoreFn      — async ({ area }) => number (1.0-5.0)
     * @param {Function} params.improveFn    — async ({ area, round }) => { applied: boolean, hints: string[] }
     * @param {number}   params.maxRounds    — hard deterministic backstop (>=1)
     * @param {number|null} params.tokenBudget — deterministic budget ceiling (or null = no budget gate)
     * @param {Function} params.spentFn      — () => number (tokens spent so far); required iff tokenBudget !== null
     * @param {Object}   params.plateau      — { rounds: int>=1, epsilon: number>=0 }
     * @returns {Promise<{ rounds: number, stopReason: string, history: Object[], finalScores: Object, errors: string[] }>}
     */
    static async run( { areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau } ) {
        const validation = ImprovementLoop.#validate( { areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau } )
        if( validation.status === false ) {
            return { rounds: 0, stopReason: 'invalid-input', history: [], finalScores: {}, errors: validation.messages }
        }

        const result = await ImprovementLoop.#step( {
            round: 0, areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau, history: []
        } )
        return result
    }


    static async #step( { round, areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau, history } ) {
        // Deterministic stops are checked BEFORE doing work (no wasted round).
        if( round >= maxRounds ) {
            return ImprovementLoop.#finish( { stopReason: 'round-limit', history, areas, scoreFn } )
        }
        if( tokenBudget !== null && spentFn() >= tokenBudget ) {
            return ImprovementLoop.#finish( { stopReason: 'token-budget', history, areas, scoreFn } )
        }

        const scores = await ImprovementLoop.#scoreAll( { areas, scoreFn } )
        const floor = ImprovementLoop.#floor( { areas, scores } )
        const record = { round, scores, floorArea: floor.area.id, floorScore: floor.score }

        // Plateau is judged on the floor-score trajectory across the window.
        const plateauHit = ImprovementLoop.#isPlateau( {
            history: history.concat( [ record ] ), plateau
        } )
        if( plateauHit === true ) {
            return ImprovementLoop.#finish( { stopReason: 'plateau', history: history.concat( [ record ] ), areas, scoreFn } )
        }

        const improvement = await improveFn( { area: floor.area, round } )
        record.improved = improvement !== null && improvement !== undefined && improvement.applied === true
        record.hints = improvement === null || improvement === undefined ? [] : ( improvement.hints || [] )

        return ImprovementLoop.#step( {
            round: round + 1, areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau,
            history: history.concat( [ record ] )
        } )
    }


    static async #scoreAll( { areas, scoreFn } ) {
        const entries = await Promise.all(
            areas.map( async ( area ) => {
                const score = await scoreFn( { area } )
                return [ area.id, score ]
            } )
        )
        return Object.fromEntries( entries )
    }


    static #floor( { areas, scores } ) {
        // Lowest score wins; ties broken by level order tool < schema < provider.
        const ranked = areas
            .map( ( area ) => ( { area, score: scores[ area.id ] } ) )
            .sort( ( a, b ) => {
                if( a.score !== b.score ) { return a.score - b.score }
                return LEVEL_ORDER[ a.area.level ] - LEVEL_ORDER[ b.area.level ]
            } )
        return ranked[ 0 ]
    }


    static #isPlateau( { history, plateau } ) {
        const window = plateau.rounds
        if( history.length < window + 1 ) { return false }
        const recent = history.slice( -( window + 1 ) )
        const floors = recent
            .map( ( record ) => record.floorScore )
        const gain = Math.max( ...floors ) - Math.min( ...floors )
        return gain <= plateau.epsilon
    }


    static async #finish( { stopReason, history, areas, scoreFn } ) {
        const finalScores = await ImprovementLoop.#scoreAll( { areas, scoreFn } )
        return { rounds: history.length, stopReason, history, finalScores, errors: [] }
    }


    static #validate( { areas, scoreFn, improveFn, maxRounds, tokenBudget, spentFn, plateau } ) {
        const messages = []
        const struct = { status: false, messages }

        if( Array.isArray( areas ) === false || areas.length === 0 ) {
            messages.push( 'LOOP-001: areas must be a non-empty array' )
        } else {
            areas
                .forEach( ( area, index ) => {
                    if( area === null || typeof area !== 'object' || typeof area.id !== 'string' ) {
                        messages.push( `LOOP-001: areas[${index}] needs an id` )
                        return
                    }
                    if( LEVEL_ORDER[ area.level ] === undefined ) {
                        messages.push( `LOOP-001: areas[${index}] (${area.id}) invalid level: ${area.level}` )
                    }
                } )
        }
        if( typeof scoreFn !== 'function' ) { messages.push( 'LOOP-001: scoreFn must be a function' ) }
        if( typeof improveFn !== 'function' ) { messages.push( 'LOOP-001: improveFn must be a function' ) }
        if( Number.isInteger( maxRounds ) === false || maxRounds < 1 ) {
            messages.push( `LOOP-002: maxRounds must be an integer >= 1, got: ${maxRounds}` )
        }
        if( tokenBudget !== null ) {
            if( typeof tokenBudget !== 'number' || tokenBudget <= 0 ) {
                messages.push( `LOOP-003: tokenBudget must be a positive number or null, got: ${tokenBudget}` )
            }
            if( typeof spentFn !== 'function' ) {
                messages.push( 'LOOP-003: spentFn required when tokenBudget is set' )
            }
        }
        if( plateau === null || typeof plateau !== 'object'
            || Number.isInteger( plateau.rounds ) === false || plateau.rounds < 1
            || typeof plateau.epsilon !== 'number' || plateau.epsilon < 0 ) {
            messages.push( 'LOOP-004: plateau must be { rounds: int>=1, epsilon: number>=0 }' )
        }

        if( messages.length === 0 ) { struct.status = true }
        return struct
    }
}


export { ImprovementLoop, STOP_REASONS, LEVEL_ORDER }
