import * as v from 'valibot';
import type { ScriptOperator, SubStoreArguments } from '../types/substore.js';
import {
    parseBooleanArg,
    parseRegexArg,
    parseStringArg,
    scalarSchema,
} from '../lib/args.js';
import { createDebugLogger, type DebugLogger } from '../lib/proxy-processor/runtime.js';
import {
    parseNodeInfoFromName,
    type NodeNameParseOptions,
} from '../lib/proxy-processor/name-parser.js';
import type {
    BaseProxy,
    NodeInfoPatch,
} from '../lib/proxy-processor/types.js';

export const parseNameScriptArgsSchema = v.object({
    entry_landing_parse_name_enabled: v.optional(scalarSchema),
    parse_name_enabled: v.optional(scalarSchema),
    entry_landing_prepare_enabled: v.optional(scalarSchema),
    prepare_entry_landing_enabled: v.optional(scalarSchema),

    entry_landing_bl: v.optional(scalarSchema),
    bl: v.optional(scalarSchema),

    entry_landing_blgd: v.optional(scalarSchema),
    blgd: v.optional(scalarSchema),

    entry_landing_blkey: v.optional(scalarSchema),
    blkey: v.optional(scalarSchema),

    entry_landing_residential_regex: v.optional(scalarSchema),
    geo_residential_regex: v.optional(scalarSchema),
    residential_regex: v.optional(scalarSchema),

    entry_landing_filter_ads: v.optional(scalarSchema),
    filter_ads: v.optional(scalarSchema),
    clear: v.optional(scalarSchema),

    entry_landing_debug: v.optional(scalarSchema),
    debug: v.optional(scalarSchema),
});

export type ParseNameScriptArgs = v.InferOutput<typeof parseNameScriptArgsSchema> & SubStoreArguments;

const parseNameArgsSchema = v.object({
    enabled: v.boolean(),
    blEnabled: v.boolean(),
    blgdEnabled: v.boolean(),
    blkey: v.string(),
    residentialRegex: v.instance(RegExp),
    filterAds: v.boolean(),
    debug: v.boolean(),
});

type ParseNameArgs = v.InferOutput<typeof parseNameArgsSchema>;

const parseNameDefaults = {
    enabled: true,
    blEnabled: false,
    blgdEnabled: false,
    blkey: '',
    residentialRegexSource: '(家宽|住宅|residential|home)',
    filterAds: false,
    debug: false,
} as const;

function parseParseNameArgs(rawArgs: SubStoreArguments): ParseNameArgs {
    return v.parse(parseNameArgsSchema, {
        enabled: parseBooleanArg(rawArgs, [
            'entry_landing_parse_name_enabled',
            'parse_name_enabled',
            'entry_landing_prepare_enabled',
            'prepare_entry_landing_enabled',
        ], parseNameDefaults.enabled),
        blEnabled: parseBooleanArg(rawArgs, ['entry_landing_bl', 'bl'], parseNameDefaults.blEnabled),
        blgdEnabled: parseBooleanArg(rawArgs, ['entry_landing_blgd', 'blgd'], parseNameDefaults.blgdEnabled),
        blkey: parseStringArg(rawArgs, ['entry_landing_blkey', 'blkey'], parseNameDefaults.blkey),
        residentialRegex: parseRegexArg(
            rawArgs,
            ['entry_landing_residential_regex', 'geo_residential_regex', 'residential_regex'],
            parseNameDefaults.residentialRegexSource,
        ),
        filterAds: parseBooleanArg(rawArgs, ['entry_landing_filter_ads', 'filter_ads', 'clear'], parseNameDefaults.filterAds),
        debug: parseBooleanArg(rawArgs, ['entry_landing_debug', 'debug'], parseNameDefaults.debug),
    });
}

/** Input proxy shape consumed by this operator. */
export type ParseNameInputProxy = BaseProxy;

/** Fields patched by this operator. */
export type ParseNamePatch = NodeInfoPatch;

/** Output proxy shape: original input plus patched private fields. */
export type ParseNameOutputProxy<TProxy extends ParseNameInputProxy> = TProxy & ParseNamePatch;

const operator: ScriptOperator<ParseNameInputProxy> = (proxies, _targetPlatform, _context) => {
    if (!Array.isArray(proxies) || proxies.length === 0) return proxies;

    const args = parseParseNameArgs(typeof $arguments !== 'undefined' ? $arguments : {});
    const logDebug = createDebugLogger('ParseName', args.debug);
    if (!args.enabled) return proxies;

    prepareProxiesNodeInfo(proxies, args, logDebug);
    return proxies;
};

export default operator;

export function prepareProxiesNodeInfo<TProxy extends ParseNameInputProxy>(
    proxies: TProxy[],
    args: ParseNameArgs,
    logDebug?: DebugLogger,
): Array<ParseNameOutputProxy<TProxy>> {
    const out: Array<ParseNameOutputProxy<TProxy>> = [];

    for (const proxy of proxies) {
        const parsed = prepareOneProxy(proxy, args);
        if (!parsed) {
            logDebug?.('filtered ad-like node', {
                name: String(proxy._originName || proxy.name || ''),
            });
            continue;
        }
        logDebug?.('parsed node info', {
            name: parsed._originName,
            nodeInfo: parsed._nodeInfo,
        });
        out.push(parsed);
    }

    proxies.splice(0, proxies.length, ...out);
    return out;
}

function prepareOneProxy<TProxy extends ParseNameInputProxy>(
    proxy: TProxy,
    args: ParseNameArgs,
): ParseNameOutputProxy<TProxy> | null {
    const originName = String(proxy._originName || proxy.name || '');
    if (!originName) return null;

    if (typeof proxy._originName === 'undefined') {
        proxy._originName = originName;
    }

    const parsed = parseNodeInfoFromName(originName, toNameParseOptions(args));
    if (args.filterAds && parsed.adLike) {
        return null;
    }

    const patch: ParseNamePatch = { _nodeInfo: parsed.nodeInfo };

    Object.assign(proxy, patch);
    return proxy as ParseNameOutputProxy<TProxy>;
}

function toNameParseOptions(args: ParseNameArgs): NodeNameParseOptions {
    return {
        blEnabled: args.blEnabled,
        blgdEnabled: args.blgdEnabled,
        blkey: args.blkey,
        residentialRegex: args.residentialRegex,
    };
}
