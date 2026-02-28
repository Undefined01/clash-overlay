// src/modules/streaming.js — 流媒体：Netflix、Disney+、YouTube、Spotify 等

import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/helpers.js';
import { mkOrder } from '../lib/lazy.js';

export default function streamingModule(final, prev, ctx) {
    const domainSets = [
        "netflix", "disney", "max", "primevideo", "appletv",
        "youtube", "tiktok", "spotify", "media",
    ].map(name => dustinRule(name));

    const netflixIp = dustinRule("netflixip");
    const mediaIp   = dustinRule("mediaip");

    return {
        'proxy-groups': mkOrder(50, [
            trafficGroup(final, "流媒体", { defaultProxy: "手动选择", icon: qureIcon("Netflix") }),
        ]),

        rules: mkOrder(50, [
            ...domainSets.map(r => rulesetRule(r.name, "流媒体")),
            rulesetRule(netflixIp.name, "流媒体", "no-resolve"),
            rulesetRule(mediaIp.name,   "流媒体", "no-resolve"),
        ]),

        'rule-providers': {
            ...Object.fromEntries(domainSets.map(r => [r.name, r.provider])),
            [netflixIp.name]: netflixIp.provider,
            [mediaIp.name]:   mediaIp.provider,
        },
    };
}
