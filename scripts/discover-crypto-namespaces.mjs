// Discover crypto-relevant namespaces from flowmcp-schemas-private.
//
// Memo 080 PRD-15 §4.1 — deterministic enumeration:
//   - reads `repos/flowmcp-schemas-private/schemas/v4.0.0/providers/`
//   - filters by whitelisted crypto namespaces (4 categories)
//   - sorts alphabetically
//   - emits JSON: [ { namespace, category, schemasPath } ]
//
// Output to stdout (default) or to --out=<path>.
//
// No for/while loops. NO SILENT DEFAULTS — whitelist is explicit.


import { readdir, stat, writeFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const PROVIDERS_RELATIVE = '../flowmcp-schemas-private/schemas/v4.0.0/providers'
const PROVIDERS_ABSOLUTE = resolve( REPO_ROOT, PROVIDERS_RELATIVE )


const CRYPTO_NAMESPACES = Object.freeze( {
    CEX: [
        'ccxt', 'bitget', 'coinbasebazaar', 'birdeye', 'coincap',
        'coingecko', 'coinmarketcap', 'cryptorank', 'ohlcv',
        'tradingsignals', 'yfinance'
    ],
    DEX: [
        'avnu', 'bonfida', 'curve', 'dexpaprika', 'dexscreener',
        'debridge', 'orca', 'pumpfun', 'uniswap', 'zerox', 'defillama'
    ],
    OnChain: [
        'alchemy', 'avalanchemetrics', 'bicscan', 'blockberry',
        'blockchaininfo', 'blocknative', 'chainlink', 'chainlinkmulticall',
        'chainlist', 'cosmos', 'ethers', 'etherscan', 'moralis',
        'passportonchain', 'pinata', 'poap', 'profilejump', 'rugcheck',
        'safeglobal', 'solanatracker', 'solscan', 'solsniffer', 'sourcify',
        'spaceid', 'starknet', 'tenderly', 'untrusted', 'wormholescan'
    ],
    Analytics: [
        'bridgerates', 'chartimg', 'charts', 'cointelegraph',
        'cryptodata', 'cryptoguide', 'duneanalytics', 'opensea',
        'polymarket', 'santiment', 'simdune', 'snapshot',
        'thegraph', 'unified'
    ]
} )


const parseArgs = ( { argv } ) => {
    const outArg = argv.find( ( a ) => a.startsWith( '--out=' ) )
    const out = outArg !== undefined ? outArg.slice( '--out='.length ) : null
    const verbose = argv.includes( '--verbose' )
    return { out, verbose }
}


const flattenWhitelist = ( { categories } ) => {
    const entries = Object
        .keys( categories )
        .sort()
        .flatMap( ( category ) => categories[ category ]
            .map( ( namespace ) => ( { namespace, category } ) )
        )
    return entries
}


const isDir = async ( { path } ) => {
    try {
        const s = await stat( path )
        return s.isDirectory()
    } catch {
        return false
    }
}


const discoverNamespaces = async ( { providersRoot, verbose } ) => {
    const allEntries = await readdir( providersRoot )
    const presentSet = new Set( allEntries )
    const whitelistEntries = flattenWhitelist( { categories: CRYPTO_NAMESPACES } )

    const checked = await Promise.all(
        whitelistEntries
            .map( async ( entry ) => {
                const schemasPath = join( providersRoot, entry.namespace )
                const exists = presentSet.has( entry.namespace ) && await isDir( { path: schemasPath } )
                return { ...entry, schemasPath, exists }
            } )
    )

    const missing = checked
        .filter( ( e ) => !e.exists )
        .map( ( e ) => e.namespace )

    if( missing.length > 0 && verbose ) {
        console.error( `[discover] WARN: missing in providers/: ${missing.join( ', ' )}` )
    }

    const present = checked
        .filter( ( e ) => e.exists )
        .sort( ( a, b ) => a.namespace.localeCompare( b.namespace ) )
        .map( ( e ) => ( {
            namespace: e.namespace,
            category: e.category,
            schemasPath: e.schemasPath
        } ) )

    return { entries: present, missing }
}


const main = async () => {
    const { out, verbose } = parseArgs( { argv: process.argv.slice( 2 ) } )

    const { entries, missing } = await discoverNamespaces( {
        providersRoot: PROVIDERS_ABSOLUTE,
        verbose
    } )

    const payload = JSON.stringify( entries, null, 2 )

    if( out !== null ) {
        await writeFile( out, payload, 'utf-8' )
        console.error( `[discover] wrote ${entries.length} entries to ${out}` )
    } else {
        process.stdout.write( payload + '\n' )
    }

    if( verbose ) {
        console.error( `[discover] discovered=${entries.length} missing=${missing.length}` )
    }
}


main()
    .catch( ( err ) => {
        console.error( `[discover] ERROR: ${err.message}` )
        process.exit( 1 )
    } )
