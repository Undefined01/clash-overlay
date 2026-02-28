// modules/custom.js — 自定义规则：校园网、特殊 IP、GitHub SSH、NJU DNS
// 这些是用户个性化配置，优先级最高（排在所有 RULE-SET 之前）。

const { externalIcon, trafficGroup } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

function customModule(final, prev, ctx) {
    return {
        // 额外代理节点（数组拼接到 proxies）
        proxies: [
            { name: "easyconnect", type: "socks5", server: "127.0.0.1", port: 1080 },
        ],

        'proxy-groups': mkOrder(10, [
            trafficGroup(final, "校园网", {
                defaultProxy: "easyconnect",
                icon: externalIcon("4XCV6mm0hqu3"),
            }),
        ]),

        rules: mkOrder(10, [
            "IP-CIDR,172.29.0.0/16,校园网",
            "IP-CIDR,142.171.5.135/32,DIRECT",
        ]),

        // NJU 域名优先使用系统 DNS
        dns: {
            "nameserver-priority": {
                "+.nju.edu.cn": "system",
            },
        },
    };
}

module.exports = customModule;
