// clash-overlay/src/modules/private.ts — 私有网络 + 广告拦截

import { dustinRule, rulesetRule, trafficGroup, externalIcon } from '../lib/clash.js';
import { mkOrder } from 'liboverlay';

export default function privateModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    const priv = dustinRule('private');
    const ads = dustinRule('ads');
    const privIp = dustinRule('privateip');

    return {
        'proxy-groups': mkOrder(700, [
            trafficGroup(final, '私有网络', { defaultProxy: 'DIRECT', icon: externalIcon('123514') }),
            trafficGroup(final, '广告', { defaultProxy: 'REJECT', icon: externalIcon('4XCV6mm0hqu3') }),
        ]),

        rules: mkOrder(700, [
            rulesetRule(priv.name, '私有网络'),
            rulesetRule(ads.name, '广告'),
            rulesetRule(privIp.name, '私有网络', 'no-resolve'),
        ]),

        'rule-providers': {
            [priv.name]: priv.provider,
            [ads.name]: ads.provider,
            [privIp.name]: privIp.provider,
        },
    };
}
