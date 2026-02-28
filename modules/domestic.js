// modules/domestic.js — 国内直连：CN 域名、国内应用、各大厂 CN 规则

const {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, miniIcon,
} = require('../lib/helpers');

module.exports = function domesticModule(final, prev, ctx) {
    const cn       = dustinRule("cn");
    const cnIp     = dustinRule("cnip");
    const apps     = makeRuleProvider(
        "DustinWin", "ruleset_geodata", "mihomo-ruleset",
        "applications.list",
    );
    const cnVendors = ["microsoft-cn", "apple-cn", "google-cn", "games-cn"]
        .map(name => dustinRule(name));

    return {
        proxyGroups: [
            trafficGroup(final, "国内直连", { defaultProxy: "DIRECT", icon: miniIcon("China") }),
        ],

        rules: [
            rulesetRule(apps.name, "国内直连"),
            ...cnVendors.map(r => rulesetRule(r.name, "国内直连")),
            // 注意：RULE-SET,cn,国内直连 由 proxy 模块追加（优先级低于具体域名规则）
        ],

        ipRules: [
            rulesetRule(cnIp.name, "国内直连", "no-resolve"),
        ],

        ruleProviders: {
            [cn.name]:   cn.provider,
            [cnIp.name]: cnIp.provider,
            [apps.name]: apps.provider,
            ...Object.fromEntries(cnVendors.map(r => [r.name, r.provider])),
        },
    };
};
