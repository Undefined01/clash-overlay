// substore-overlay/src/modules/landing-proxy.ts — 落地代理

// 文档: https://github.com/MetaCubeX/Meta-Docs/blob/e8662ede5748e9bc5a23764ce447ea4f833d8e6c/docs/config/proxies/dialer-proxy.md

import type { ModuleArgs } from 'libmodule';
import { mkOrder } from 'libmodule';
import { GROUP_COMMON, PRIMITIVE_GROUPS, externalIcon, reorderProxies } from '../lib/clash.js';
import type { ModuleContext } from './lib.js';
import { NodeInfo } from '../lib/proxy-processor/types.js';

export default function landingProxyModule(
    args: ModuleArgs,
): Record<string, unknown> {
    const ctx = args.ctx as ModuleContext;
    const forwardProxies = ctx.originalConfig.proxies?.filter(p => {
        let tags = (p._nodeInfo as NodeInfo)?.tags || [];
        return !tags.includes('落地');
    }).map(p => p.name as string) ?? [];
    const landingProxies = ctx.originalConfig.proxies?.filter(p => {
        let tags = (p._nodeInfo as NodeInfo)?.tags || [];
        return tags.includes('家宽') || tags.includes('落地');
    }).map(p => p.name as string) ?? [];

    return {
        'proxy-groups': mkOrder(600, [
            {
                ...GROUP_COMMON,
                name: '落地代理',
                type: 'url-test',
                proxies: landingProxies.concat(PRIMITIVE_GROUPS),
                'dialer-proxy': '落地前置',
                icon: externalIcon('ABvCfQAJ'),
            },
            {
                ...GROUP_COMMON,
                name: '落地前置',
                type: 'select',
                proxies: reorderProxies(PRIMITIVE_GROUPS.concat(forwardProxies), 'REJECT'),
                icon: externalIcon('ABvCfQAJ'),
            },
            // 向手动选择组添加落地代理（通过 keyedListOf 按 name 合并）
            { name: '手动选择', proxies: mkOrder(705, ['落地代理']) },
        ]),
    };
}
