// src/modules/custom.js — 自定义规则：校园网、特殊 IP、NJU DNS

import { externalIcon, trafficGroup } from '../lib/helpers.js';
import { mkOrder } from '../lib/lazy.js';

export default function customModule(final, prev, ctx) {
    return {
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

        dns: {
            "nameserver-priority": {
                "+.nju.edu.cn": "system",
            },
        },
    };
}
