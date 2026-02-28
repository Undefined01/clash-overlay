// modules/dns.js — DNS 配置：服务器、fake-ip、hosts
// 解析流程见 https://wiki.metacubex.one/config/dns/diagram/#_2

const { dustinRule } = require('../lib/helpers');

module.exports = function dnsModule(final, prev, ctx) {
    const { ipv6Enabled, dnsMode } = ctx.args;

    if (dnsMode !== "fake-ip" && dnsMode !== "redir-host") {
        throw new Error("Invalid dnsMode: " + dnsMode);
    }

    const cnDns = [
        "system",
        "223.5.5.5", "223.6.6.6",
        "2400:3200::1", "2400:3200:baba::1",
        "https://doh.pub/dns-query",
        "https://dns.alidns.com/dns-query",
    ];

    // EDNS Client Subnet 设为国内 IP 段，避免经代理解析时返回国外 IP
    const trustedDns = [
        "https://cloudflare-dns.com/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true",
        "https://dns.google/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true",
    ];

    // fakeip-filter 规则集仅用于 DNS，不产生 RULE-SET 规则
    const fakeipFilter = dustinRule("fakeip-filter");

    return {
        hosts: {
            "dns.alidns.com": [
                "223.5.5.5", "223.6.6.6",
                "2400:3200::1", "2400:3200:baba::1",
            ],
            "dns.pub": ["119.29.29.29", "1.12.12.12", "2402:4e00::"],
        },

        dns: {
            enable: true,
            ipv6: ipv6Enabled,
            "enhanced-mode": dnsMode,
            "prefer-h3": true,
            "use-hosts": true,
            "use-system-hosts": true,
            "respect-rules": false,

            ...(dnsMode === "fake-ip" ? {
                "fake-ip-filter-mode": "blacklist",
                "fake-ip-filter": [
                    "rule-set:fakeip-filter",
                    "rule-set:private",
                    "rule-set:cn",
                ],
            } : {}),

            // 解析其他 DNS 服务器域名，必须为 IP
            "direct-nameserver": [
                "system",
                "223.5.5.5", "223.6.6.6",
                "2400:3200::1", "2400:3200:baba::1",
            ],
            // 解析代理节点域名（此时代理尚不可用）
            "proxy-server-nameserver": cnDns,
            // 解析域名以判断 Geosite IP 分流
            nameserver: trustedDns,
        },

        // 仅注册 fakeip-filter 规则集（不生成 RULE-SET 规则）
        ruleProviders: { [fakeipFilter.name]: fakeipFilter.provider },
    };
};
