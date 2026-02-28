// clash-overlay/src/modules/landing-proxy.ts — 落地代理

import { deferred, mkOrder } from 'liboverlay';
import { GROUP_COMMON, externalIcon } from '../lib/clash.js';
import type { ModuleContext } from '../lib/merge.js';

export default function landingProxyModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
    ctx: ModuleContext,
): Record<string, unknown> {
    const proxies = ctx.config.proxies.map(p => p.name);
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
                    ...(final._allSelectables as string[]),
                ]),
                icon: externalIcon('ABvCfQAJ'),
            },
        ]),
    };
}
