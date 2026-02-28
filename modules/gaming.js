// modules/gaming.js — 游戏平台

const { dustinRule, rulesetRule, trafficGroup, miniIcon } = require('../lib/helpers');

module.exports = function gamingModule(final, prev, ctx) {
    const games   = dustinRule("games");
    const gamesIp = dustinRule("gamesip");

    return {
        proxyGroups: [
            trafficGroup(final, "游戏平台", { defaultProxy: "手动选择", icon: miniIcon("Steam") }),
        ],

        rules: [
            rulesetRule(games.name, "游戏平台"),
        ],

        ipRules: [
            rulesetRule(gamesIp.name, "游戏平台", "no-resolve"),
        ],

        ruleProviders: {
            [games.name]:   games.provider,
            [gamesIp.name]: gamesIp.provider,
        },
    };
};
