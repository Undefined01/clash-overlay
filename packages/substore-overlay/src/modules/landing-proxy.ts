// substore-overlay/src/modules/landing-proxy.ts — 落地代理

import { deferred, mkOrder } from 'libmodule';
import { GROUP_COMMON, externalIcon } from '../lib/clash.js';

export default function landingProxyModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const proxies = (config.proxies as Array<{ name?: unknown }> || [])
        .map(p => String(p.name || ''))
        .filter(Boolean);
    const LANDING_FILTER = '(?i)落地|Landing|固定|Residential';

    return {
        'proxy-groups': mkOrder(600, [
            {
                ...GROUP_COMMON,
                name: '落地代理',
                type: 'url-test',
                proxies,
                filter: LANDING_FILTER,
                'dialer-proxy': '手动选择',
                icon: externalIcon('ABvCfQAJ'),
            },
            {
                ...GROUP_COMMON,
                name: '落地切换',
                type: 'select',
                proxies: deferred(() => [
                    '落地代理',
                    '国外 AI',
                    ...(config._allSelectables as string[]),
                ]),
                icon: externalIcon('ABvCfQAJ'),
            },
        ]),
    };
}
