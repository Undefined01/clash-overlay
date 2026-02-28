// modules/proxy.js — 国外代理 + 漏网之鱼 兜底
// 包含 proxy、networktest、tld-proxy 等域名规则，
// 以及 cn 域名 catch-all、telegramip 和 MATCH 兜底。
// order = 90，确保 MATCH 规则在所有模块规则之后。

const {
    dustinRule, rulesetRule,
    trafficGroup, qureIcon,
} = require('../lib/helpers');
const { mkOrder, mkAfter } = require('../lib/lazy');

function proxyModule(final, prev, ctx) {
    const proxy       = dustinRule("proxy");
    const networktest = dustinRule("networktest");
    const tldProxy    = dustinRule("tld-proxy");
    const telegramIp  = dustinRule("telegramip");

    return {
        'proxy-groups': mkOrder(90, [
            trafficGroup(final, "国外代理", { defaultProxy: "手动选择", icon: qureIcon("Global") }),
            trafficGroup(final, "漏网之鱼", { defaultProxy: "手动选择", icon: qureIcon("Final") }),
        ]),

        rules: [
            mkOrder(90, [
                rulesetRule(networktest.name, "国外代理"),
                rulesetRule(tldProxy.name,    "国外代理"),
                rulesetRule(proxy.name,       "国外代理"),
                // cn 域名 catch-all（provider 由 domestic 模块注册）
                rulesetRule("cn", "国内直连"),
                rulesetRule(telegramIp.name, "国外代理", "no-resolve"),
            ]),
            // MATCH 兆底 — mkAfter 保证绝对置底
            mkAfter(["MATCH,漏网之鱼"]),
        ],

        'rule-providers': {
            [proxy.name]:       proxy.provider,
            [networktest.name]: networktest.provider,
            [tldProxy.name]:    tldProxy.provider,
            [telegramIp.name]:  telegramIp.provider,
        },
    };
}

module.exports = proxyModule;
