// substore-overlay/src/modules/ssh.ts — SSH 代理模块

import { defer, mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { GROUP_COMMON, reorderProxies, externalIcon } from '../lib/clash.js';

export default function sshModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    return {
        'proxy-groups': mkOrder(675, [
            {
                ...GROUP_COMMON,
                name: 'SSH 代理',
                type: 'select',
                proxies: defer(() =>
                    reorderProxies(config._allSelectables as string[], 'DIRECT'),
                ),
                icon: externalIcon('fSPmETYJKmmk'),
            },
        ]),

        rules: mkOrder(675, [
            'DST-PORT,22,SSH 代理',
        ]),
    };
}
