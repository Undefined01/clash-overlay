import { dustinRule, rulesetRule, trafficGroup, externalIcon } from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function privateModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    const priv = dustinRule('private');
    const ads = dustinRule('ads');
    const privIp = dustinRule('privateip');

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('private'), [
            trafficGroup(config, '私有网络', { defaultProxy: 'DIRECT', icon: externalIcon('123514') }),
            trafficGroup(config, '广告', { defaultProxy: 'REJECT', icon: externalIcon('4XCV6mm0hqu3') }),
        ]),

        rules: mkOrder(ruleOrder('private'), [
            rulesetRule(priv, '私有网络'),
            rulesetRule(privIp, '私有网络'),
            rulesetRule(ads, '广告'),
        ]),

        'rule-providers': {
            [priv.name]: priv.provider,
            [ads.name]: ads.provider,
            [privIp.name]: privIp.provider,
        },
    };
}
