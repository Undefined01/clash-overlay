// modules/private.js — 私有网络 + 广告拦截

const { dustinRule, rulesetRule, trafficGroup, externalIcon } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

function privateModule(final, prev, ctx) {
    const priv = dustinRule("private");
    const ads  = dustinRule("ads");
    const privIp = dustinRule("privateip");

    return {
        'proxy-groups': mkOrder(20, [
            trafficGroup(final, "私有网络", { defaultProxy: "DIRECT", icon: externalIcon("123514") }),
            trafficGroup(final, "广告",     { defaultProxy: "REJECT", icon: externalIcon("4XCV6mm0hqu3") }),
        ]),

        rules: mkOrder(20, [
            rulesetRule(priv.name, "私有网络"),
            rulesetRule(ads.name,  "广告"),
            rulesetRule(privIp.name, "私有网络", "no-resolve"),
        ]),

        'rule-providers': {
            [priv.name]:   priv.provider,
            [ads.name]:    ads.provider,
            [privIp.name]: privIp.provider,
        },
    };
}

module.exports = privateModule;
