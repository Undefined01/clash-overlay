// src/modules/landing-proxy.js — 落地代理（链式代理固定出口 IP）

import { deferred, mkOrder } from '../lib/lazy.js';
import { GROUP_COMMON, externalIcon } from '../lib/helpers.js';

export default function landingProxyModule(final, prev, ctx) {
    const proxies = ctx.config.proxies.map(p => p.name);

    const LANDING_FILTER = "(?i)落地|Landing|固定|Residential";

    return {
        'proxy-groups': mkOrder(3, [
            {
                ...GROUP_COMMON,
                name: "落地代理",
                type: "url-test",
                proxies,
                filter: LANDING_FILTER,
                "dialer-proxy": "手动选择",
                icon: externalIcon("ABvCfQAJ"),
            },
            {
                ...GROUP_COMMON,
                name: "落地切换",
                type: "select",
                proxies: deferred(() => [
                    "落地代理",
                    "国外 AI",
                    ...final._allSelectables,
                ]),
                icon: externalIcon("ABvCfQAJ"),
            },
        ]),
    };
}
