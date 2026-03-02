import { normalizeCountryCode } from './country.js';
import type { NodeInfo } from './types.js';

export interface NodeNameParseOptions {
    blEnabled: boolean;
    blgdEnabled: boolean;
    blkey: string;
    residentialRegex: RegExp;
}

export interface NodeNameParseResult {
    nodeInfo: NodeInfo;
    adLike: boolean;
}

const adNamePattern =
    /(套餐|到期|有效|剩余|版本|已用|过期|失联|测试|官方|网址|备用|群|TEST|客服|网站|获取|订阅|流量|机场|下次|官址|联系|邮箱|工单|学术|USE|USED|TOTAL|EXPIRE|EMAIL)/i;

/**
 * Built-in tag rules used when `blgdEnabled=true`.
 * The array order is preserved in output (deduped by first appearance).
 */
const builtInTagRules: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /IPLC/i, tag: 'IPLC' },
    { pattern: /IEPL/i, tag: 'IEPL' },
    { pattern: /核心/, tag: '核心' },
    { pattern: /边缘/, tag: '边缘' },
    { pattern: /高级/, tag: '高级' },
    { pattern: /标准/, tag: '标准' },
    { pattern: /实验/, tag: '实验' },
    { pattern: /商宽/, tag: '商宽' },
    { pattern: /游戏|game/i, tag: '游戏' },
    { pattern: /购物/, tag: '购物' },
    { pattern: /专线/, tag: '专线' },
    { pattern: /LB/i, tag: 'LB' },
    { pattern: /cloudflare/i, tag: 'CF' },
    { pattern: /\budp\b/i, tag: 'UDP' },
    { pattern: /\bgpt\b/i, tag: 'GPT' },
    { pattern: /\budpn\b/i, tag: 'UDPN' },
];

const countryAliasToCode: Record<string, string> = {
    HK: 'HK', HKG: 'HK', 香港: 'HK', 港: 'HK',
    US: 'US', USA: 'US', 美国: 'US', 美: 'US',
    SG: 'SG', SGP: 'SG', 新加坡: 'SG', 狮城: 'SG',
    JP: 'JP', JPN: 'JP', 日本: 'JP', 日: 'JP',
    KR: 'KR', KOR: 'KR', 韩国: 'KR', 韩: 'KR',
    TW: 'TW', TWN: 'TW', 台湾: 'TW', 台: 'TW',
    MO: 'MO', MAC: 'MO', 澳门: 'MO',
    CN: 'CN', CHN: 'CN', 中国: 'CN', 大陆: 'CN',
    GB: 'GB', UK: 'GB', GBR: 'GB', 英国: 'GB',
    DE: 'DE', DEU: 'DE', 德国: 'DE',
    FR: 'FR', FRA: 'FR', 法国: 'FR',
    CA: 'CA', CAN: 'CA', 加拿大: 'CA',
    AU: 'AU', AUS: 'AU', 澳大利亚: 'AU', 澳洲: 'AU',
    NZ: 'NZ', NZL: 'NZ', 新西兰: 'NZ',
};

export function parseNodeInfoFromName(
    name: string,
    options: NodeNameParseOptions,
): NodeNameParseResult {
    const normalizedName = String(name || '');
    const countryCode = resolveCountryCode(normalizedName);
    const multiplier = resolveMultiplier(normalizedName, options.blEnabled);
    const tags = collectTags(normalizedName, options);

    const nodeInfo: NodeInfo = { countryCode };
    if (typeof multiplier === 'number') nodeInfo.multiplier = multiplier;
    if (tags.length > 0) nodeInfo.tags = tags;

    return {
        nodeInfo,
        adLike: isAdLikeName(normalizedName),
    };
}

export function isAdLikeName(name: string): boolean {
    return adNamePattern.test(name);
}

export function resolveCountryCode(name: string): string {
    const codes = resolveCountryCodes(name);
    const selected = codes[0] || 'ZZ';
    return normalizeCountryCode(selected);
}

function resolveCountryCodes(name: string): string[] {
    const flagCodes = extractFlagCodes(name);
    if (flagCodes.length > 0) return flagCodes;

    const routeMatch = name.match(/([^\s|/]+)\s*(?:->|→|>|＞|到|to)\s*([^\s|/]+)/i);
    if (routeMatch) {
        const first = resolveCountryToken(routeMatch[1]);
        const second = resolveCountryToken(routeMatch[2]);
        if (first && second) return [first, second];
    }

    return collectCountryCodes(name);
}

function collectCountryCodes(name: string): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const pushCode = (code: string | undefined): void => {
        if (!code || seen.has(code)) return;
        seen.add(code);
        ordered.push(code);
    };

    const upperCodeMatches = Array.from(
        name.matchAll(/(?:^|[\s|/()[\]{}_-])([A-Z]{2})(?=$|[\s|/()[\]{}_-])/g),
    ).map(match => match[1]);
    for (const token of upperCodeMatches) {
        pushCode(resolveCountryToken(token));
    }

    const textTokenMatches = name.match(/[A-Za-z]{2,16}|[\u4e00-\u9fa5]{1,8}/g) || [];
    for (const token of textTokenMatches) {
        pushCode(resolveCountryToken(token));
    }

    return ordered;
}

function extractFlagCodes(name: string): string[] {
    const matches = name.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g) || [];
    const codes: string[] = [];
    for (const flag of matches) {
        const code = flagToCountryCode(flag);
        if (code) codes.push(code);
    }
    return codes;
}

function flagToCountryCode(flag: string): string | undefined {
    if (flag.length !== 4) return undefined;

    const first = flag.codePointAt(0);
    const second = flag.codePointAt(2);
    if (!first || !second) return undefined;

    const base = 0x1f1e6;
    const a = first - base;
    const b = second - base;
    if (a < 0 || a > 25 || b < 0 || b > 25) return undefined;

    const code = String.fromCharCode(65 + a, 65 + b);
    return resolveCountryToken(code);
}

function resolveCountryToken(rawToken: string): string | undefined {
    const token = String(rawToken || '').trim();
    if (!token) return undefined;

    if (/^[A-Z]{2}$/.test(token)) return token;
    if (/^[A-Za-z]{2}$/.test(token)) return undefined;

    const normalized = token.replace(/[\[\](){}【】\-_]/g, '');
    return countryAliasToCode[normalized] || countryAliasToCode[normalized.toUpperCase()];
}

function resolveMultiplier(name: string, blEnabled: boolean): number | undefined {
    const blMultiplier = blEnabled ? extractBlMultiplier(name) : undefined;
    return blMultiplier ?? extractSimpleMultiplier(name) ?? extractSuperscriptMultiplier(name);
}

function extractSimpleMultiplier(name: string): number | undefined {
    const patterns = [
        /(\d+(?:\.\d+)?)\s*x\b/i,
        /x\s*(\d+(?:\.\d+)?)/i,
        /×\s*(\d+(?:\.\d+)?)/i,
        /(\d+(?:\.\d+)?)\s*倍(?:率)?/i,
    ];
    for (const pattern of patterns) {
        const match = name.match(pattern);
        if (match && match[1]) {
            const parsed = Number.parseFloat(match[1]);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    }
    return undefined;
}

function extractSuperscriptMultiplier(name: string): number | undefined {
    const mapping: Array<[RegExp, number]> = [
        [/ˣ²/, 2],
        [/ˣ³/, 3],
        [/ˣ⁴/, 4],
        [/ˣ⁵/, 5],
        [/ˣ⁶/, 6],
        [/ˣ⁷/, 7],
        [/ˣ⁸/, 8],
        [/ˣ⁹/, 9],
        [/ˣ¹⁰/, 10],
        [/ˣ²⁰/, 20],
        [/ˣ³⁰/, 30],
        [/ˣ⁴⁰/, 40],
        [/ˣ⁵⁰/, 50],
    ];
    for (const [regex, value] of mapping) {
        if (regex.test(name)) return value;
    }
    return undefined;
}

function extractBlMultiplier(name: string): number | undefined {
    const match = name.match(/((倍率|X|x|×)\D?((\d{1,3}\.)?\d+)\D?)|((\d{1,3}\.)?\d+)(倍|X|x|×)/);
    if (!match) return undefined;

    const numberMatch = match[0].match(/(\d[\d.]*)/);
    if (!numberMatch) return undefined;

    const parsed = Number.parseFloat(numberMatch[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
}

function collectTags(name: string, options: NodeNameParseOptions): string[] {
    const tags: string[] = [];
    const seen = new Set<string>();

    const pushTag = (tag: string | undefined): void => {
        if (!tag || seen.has(tag)) return;
        seen.add(tag);
        tags.push(tag);
    };

    if (options.blgdEnabled) {
        for (const rule of builtInTagRules) {
            if (rule.pattern.test(name)) pushTag(rule.tag);
        }
    }

    if (options.residentialRegex.test(name)) {
        pushTag('家宽');
    }

    if (options.blkey) {
        for (const token of options.blkey.split('+').map(item => item.trim()).filter(Boolean)) {
            if (token.includes('>')) {
                const [from, to] = token.split('>');
                if (from && name.includes(from)) {
                    pushTag((to || from).trim());
                }
                continue;
            }
            if (name.includes(token)) {
                pushTag(token);
            }
        }
    }

    return tags;
}
