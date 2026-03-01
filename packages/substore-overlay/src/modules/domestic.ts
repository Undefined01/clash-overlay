// substore-overlay/src/modules/domestic.ts — 国内直连

import {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, miniIcon,
} from '../lib/clash.js';
import { mkOrder } from 'liboverlay';

export default function domesticModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    const cn = dustinRule('cn');
    const cnIp = dustinRule('cnip');
    const apps = makeRuleProvider(
        'DustinWin', 'ruleset_geodata', 'mihomo-ruleset',
        'applications.list',
    );
    const cnVendors = ['microsoft-cn', 'apple-cn', 'google-cn', 'games-cn']
        .map(name => dustinRule(name));

    return {
        'proxy-groups': mkOrder(800, [
            trafficGroup(final, '国内直连', { defaultProxy: 'DIRECT', icon: miniIcon('China') }),
        ]),

        rules: mkOrder(800, [
            rulesetRule(apps.name, '国内直连'),
            ...cnVendors.map(r => rulesetRule(r.name, '国内直连')),
            rulesetRule(cnIp.name, '国内直连', 'no-resolve'),
        ]),

        'rule-providers': {
            [cn.name]: cn.provider,
            [cnIp.name]: cnIp.provider,
            [apps.name]: apps.provider,
            ...Object.fromEntries(cnVendors.map(r => [r.name, r.provider])),
        },
    };
}
