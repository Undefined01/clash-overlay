// substore-overlay/src/modules/proxy.ts — 国外代理 + 漏网之鱼 兜底

import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/clash.js';
import { mkOrder, mkAfter } from 'libmodule';

export default function proxyModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const proxy = dustinRule('proxy');
    const networktest = dustinRule('networktest');
    const tldProxy = dustinRule('tld-proxy');
    const telegramIp = dustinRule('telegramip');

    return {
        'proxy-groups': mkOrder(1100, [
            trafficGroup(config, '国外代理', { defaultProxy: '手动选择', icon: qureIcon('Global') }),
            trafficGroup(config, '漏网之鱼', { defaultProxy: '手动选择', icon: qureIcon('Final') }),
        ]),

        rules: [
            mkOrder(1100, [
                rulesetRule(networktest.name, '国外代理'),
                rulesetRule(tldProxy.name, '国外代理'),
                rulesetRule(proxy.name, '国外代理'),
                rulesetRule('cn', '国内直连'),
                rulesetRule(telegramIp.name, '国外代理', 'no-resolve'),
            ]),
            mkAfter(['MATCH,漏网之鱼']),
        ],

        'rule-providers': {
            [proxy.name]: proxy.provider,
            [networktest.name]: networktest.provider,
            [tldProxy.name]: tldProxy.provider,
            [telegramIp.name]: telegramIp.provider,
        },
    };
}
