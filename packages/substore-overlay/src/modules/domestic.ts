import {
    dustinRule, rulesetRule,
    trafficGroup, miniIcon,
} from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function domesticModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    const cn = dustinRule('cn');
    const cnIp = dustinRule('cnip');
    const cnVendors = ['microsoft-cn', 'apple-cn', 'google-cn', 'games-cn']
        .map(name => dustinRule(name));

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('domestic'), [
            trafficGroup(config, '国内直连', { defaultProxy: 'DIRECT', icon: miniIcon('China') }),
        ]),

        rules: mkOrder(ruleOrder('domestic'), [
            ...cnVendors.map(r => rulesetRule(r, '国内直连')),
            rulesetRule(cn, '国内直连'),
            rulesetRule(cnIp, '国内直连'),
        ]),

        'rule-providers': {
            [cn.name]: cn.provider,
            [cnIp.name]: cnIp.provider,
            ...Object.fromEntries(cnVendors.map(r => [r.name, r.provider])),
        },
    };
}
