// clash-overlay/src/modules/dns.ts — DNS 配置

import { dustinRule } from '../lib/clash.js';
import type { ModuleContext } from '../lib/merge.js';

export default function dnsModule(
    _final: Record<string, unknown>,
    _prev: Record<string, unknown>,
    ctx: ModuleContext,
): Record<string, unknown> {
    const { ipv6Enabled, dnsMode } = ctx.args as { ipv6Enabled: boolean; dnsMode: string };

    if (dnsMode !== 'fake-ip' && dnsMode !== 'redir-host') {
        throw new Error('Invalid dnsMode: ' + dnsMode);
    }

    const cnDns = [
        'system',
        '223.5.5.5', '223.6.6.6',
        '2400:3200::1', '2400:3200:baba::1',
        'https://doh.pub/dns-query',
        'https://dns.alidns.com/dns-query',
    ];

    const trustedDns = [
        'https://cloudflare-dns.com/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true',
        'https://dns.google/dns-query#proxy&ecs=120.76.0.0/14&ecs-override=true',
    ];

    const fakeipFilter = dustinRule('fakeip-filter');

    return {
        hosts: {
            'dns.alidns.com': [
                '223.5.5.5', '223.6.6.6',
                '2400:3200::1', '2400:3200:baba::1',
            ],
            'dns.pub': ['119.29.29.29', '1.12.12.12', '2402:4e00::'],
        },

        dns: {
            enable: true,
            ipv6: ipv6Enabled,
            'enhanced-mode': dnsMode,
            'prefer-h3': true,
            'use-hosts': true,
            'use-system-hosts': true,
            'respect-rules': false,

            ...(dnsMode === 'fake-ip' ? {
                'fake-ip-filter-mode': 'blacklist',
                'fake-ip-filter': [
                    'rule-set:fakeip-filter',
                    'rule-set:private',
                    'rule-set:cn',
                ],
            } : {}),

            'direct-nameserver': [
                'system',
                '223.5.5.5', '223.6.6.6',
                '2400:3200::1', '2400:3200:baba::1',
            ],
            'proxy-server-nameserver': cnDns,
            nameserver: trustedDns,
        },

        'rule-providers': { [fakeipFilter.name]: fakeipFilter.provider },
    };
}
