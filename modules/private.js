// modules/private.js — 私有网络 + 广告拦截

const { dustinRule, rulesetRule, trafficGroup, externalIcon } = require('../lib/helpers');

module.exports = function privateModule(final, prev, ctx) {
    const priv = dustinRule("private");
    const ads  = dustinRule("ads");
    const privIp = dustinRule("privateip");

    return {
        proxyGroups: [
            trafficGroup(final, "私有网络", { defaultProxy: "DIRECT", icon: externalIcon("123514") }),
            trafficGroup(final, "广告",     { defaultProxy: "REJECT", icon: externalIcon("4XCV6mm0hqu3") }),
        ],

        rules: [
            rulesetRule(priv.name, "私有网络"),
            rulesetRule(ads.name,  "广告"),
        ],

        ipRules: [
            rulesetRule(privIp.name, "私有网络", "no-resolve"),
        ],

        ruleProviders: {
            [priv.name]:   priv.provider,
            [ads.name]:    ads.provider,
            [privIp.name]: privIp.provider,
        },
    };
};
