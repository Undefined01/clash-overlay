// modules/proxy.js — 国外代理 + 漏网之鱼 兜底
// 包含 proxy、networktest、tld-proxy 等域名规则，
// 以及 cn 域名 catch-all 和 telegramip。

const {
    dustinRule, rulesetRule,
    trafficGroup, qureIcon,
} = require('../lib/helpers');

module.exports = function proxyModule(final, prev, ctx) {
    const proxy       = dustinRule("proxy");
    const networktest = dustinRule("networktest");
    const tldProxy    = dustinRule("tld-proxy");
    const telegramIp  = dustinRule("telegramip");

    return {
        proxyGroups: [
            trafficGroup(final, "国外代理", { defaultProxy: "手动选择", icon: "Global" }),
            trafficGroup(final, "漏网之鱼", { defaultProxy: "手动选择", icon: "Final" }),
        ],

        // 漏网之鱼 作为 MATCH 回落组
        _fallbackGroup: "漏网之鱼",

        rules: [
            rulesetRule(networktest.name, "国外代理"),
            rulesetRule(tldProxy.name,    "国外代理"),
            rulesetRule(proxy.name,       "国外代理"),
            // cn 域名 catch-all（provider 由 domestic 模块注册）
            rulesetRule("cn", "国内直连"),
        ],

        ipRules: [
            rulesetRule(telegramIp.name, "国外代理", "no-resolve"),
        ],

        ruleProviders: {
            [proxy.name]:       proxy.provider,
            [networktest.name]: networktest.provider,
            [tldProxy.name]:    tldProxy.provider,
            [telegramIp.name]:  telegramIp.provider,
        },
    };
};
