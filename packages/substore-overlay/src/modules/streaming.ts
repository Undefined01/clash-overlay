import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function streamingModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    // netflixip and mediaip are intentionally kept in lower case, following the naming in the dustin upstream.
    const rulesets = [
        'netflix', 'netflixip', 'disney', 'max', 'primevideo', 'appletv',
        'youtube', 'tiktok', 'spotify', 'media', 'mediaip',
    ].map(name => dustinRule(name));

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('streaming'), [
            trafficGroup(config, '流媒体', { defaultProxy: '手动选择', icon: qureIcon('Netflix') }),
        ]),

        rules: mkOrder(ruleOrder('streaming'), rulesets.map(r => rulesetRule(r, '流媒体'))),

        'rule-providers': Object.fromEntries(rulesets.map(r => [r.name, r.provider])),
    };
}
