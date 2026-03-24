import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/clash.js';
import { mkOrder, mkAfter, mkMerge } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function proxyModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    const cn = dustinRule('cn');
    const proxy = dustinRule('proxy');
    const networktest = dustinRule('networktest');
    const tldProxy = dustinRule('tld-proxy');
    const telegramIp = dustinRule('telegramip');

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('proxy'), [
            trafficGroup(config, '国外代理', { defaultProxy: '手动选择', icon: qureIcon('Global') }),
            trafficGroup(config, '漏网之鱼', { defaultProxy: '手动选择', icon: qureIcon('Final') }),
        ]),

        rules: mkMerge([
            mkOrder(ruleOrder('proxy'), [
                rulesetRule(networktest, '国外代理'),
                rulesetRule(tldProxy, '国外代理'),
                rulesetRule(proxy, '国外代理'),
                rulesetRule(cn, '国内直连'),
                rulesetRule(telegramIp, '国外代理'),
            ]),
            mkAfter(['MATCH,漏网之鱼']),
        ]),

        'rule-providers': {
            [proxy.name]: proxy.provider,
            [networktest.name]: networktest.provider,
            [tldProxy.name]: tldProxy.provider,
            [telegramIp.name]: telegramIp.provider,
        },
    };
}
