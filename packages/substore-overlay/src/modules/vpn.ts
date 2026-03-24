import { externalIcon, trafficGroup } from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function vpnModule(
    { config }: ModuleArgs,
): Record<string, unknown> {

    return {
        proxies: [
            { name: 'easyconnect', type: 'socks5', server: '127.0.0.1', port: 1080 },
        ],

        'proxy-groups': mkOrder(proxyGroupOrder('vpn'), [
            trafficGroup(config, '校园网', {
                defaultProxy: 'DIRECT',
                icon: externalIcon('4XCV6mm0hqu3'),
            }),
        ]),

        rules: mkOrder(ruleOrder('vpn'), [
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
