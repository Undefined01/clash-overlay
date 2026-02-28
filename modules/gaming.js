// modules/gaming.js — 游戏平台

const { dustinRule, rulesetRule, trafficGroup, miniIcon } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

function gamingModule(final, prev, ctx) {
    const games   = dustinRule("games");
    const gamesIp = dustinRule("gamesip");

    return {
        'proxy-groups': mkOrder(55, [
            trafficGroup(final, "游戏平台", { defaultProxy: "手动选择", icon: miniIcon("Steam") }),
        ]),

        rules: mkOrder(55, [
            rulesetRule(games.name, "游戏平台"),
            rulesetRule(gamesIp.name, "游戏平台", "no-resolve"),
        ]),

        'rule-providers': {
            [games.name]:   games.provider,
            [gamesIp.name]: gamesIp.provider,
        },
    };
}

module.exports = gamingModule;
