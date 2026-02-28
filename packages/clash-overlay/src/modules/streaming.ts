// clash-overlay/src/modules/streaming.ts — 流媒体

import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/clash.js';
import { mkOrder } from 'liboverlay';

export default function streamingModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    const domainSets = [
        'netflix', 'disney', 'max', 'primevideo', 'appletv',
        'youtube', 'tiktok', 'spotify', 'media',
    ].map(name => dustinRule(name));

    const netflixIp = dustinRule('netflixip');
    const mediaIp = dustinRule('mediaip');

    return {
        'proxy-groups': mkOrder(850, [
            trafficGroup(final, '流媒体', { defaultProxy: '手动选择', icon: qureIcon('Netflix') }),
        ]),

        rules: mkOrder(850, [
            ...domainSets.map(r => rulesetRule(r.name, '流媒体')),
            rulesetRule(netflixIp.name, '流媒体', 'no-resolve'),
            rulesetRule(mediaIp.name, '流媒体', 'no-resolve'),
        ]),

        'rule-providers': {
            ...Object.fromEntries(domainSets.map(r => [r.name, r.provider])),
            [netflixIp.name]: netflixIp.provider,
            [mediaIp.name]: mediaIp.provider,
        },
    };
}
