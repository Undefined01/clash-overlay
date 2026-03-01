// substore-overlay/src/modules/custom.ts — 自定义规则

import { externalIcon, trafficGroup } from '../lib/clash.js';
import { mkOrder } from 'libmodule';

export default function customModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    return {
        proxies: [
            { name: 'easyconnect', type: 'socks5', server: '127.0.0.1', port: 1080 },
        ],

        'proxy-groups': mkOrder(650, [
            trafficGroup(config, '校园网', {
                defaultProxy: 'easyconnect',
                icon: externalIcon('4XCV6mm0hqu3'),
            }),
        ]),

        rules: mkOrder(650, [
            'IP-CIDR,172.29.0.0/16,校园网',
            'IP-CIDR,142.171.5.135/32,DIRECT',
        ]),

        dns: {
            'nameserver-priority': {
                '+.nju.edu.cn': 'system',
            },
        },
    };
}
