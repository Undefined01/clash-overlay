// modules/streaming.js — 流媒体：Netflix、Disney+、YouTube、Spotify 等

const { dustinRule, rulesetRule, trafficGroup, qureIcon } = require('../lib/helpers');

module.exports = function streamingModule(final, prev, ctx) {
    const domainSets = [
        "netflix", "disney", "max", "primevideo", "appletv",
        "youtube", "tiktok", "spotify", "media",
    ].map(name => dustinRule(name));

    const netflixIp = dustinRule("netflixip");
    const mediaIp   = dustinRule("mediaip");

    return {
        proxyGroups: [
            trafficGroup(final, "流媒体", { defaultProxy: "手动选择", icon: "Netflix" }),
        ],

        rules: domainSets.map(r => rulesetRule(r.name, "流媒体")),

        ipRules: [
            rulesetRule(netflixIp.name, "流媒体", "no-resolve"),
            rulesetRule(mediaIp.name,   "流媒体", "no-resolve"),
        ],

        ruleProviders: {
            ...Object.fromEntries(domainSets.map(r => [r.name, r.provider])),
            [netflixIp.name]: netflixIp.provider,
            [mediaIp.name]:   mediaIp.provider,
        },
    };
};
