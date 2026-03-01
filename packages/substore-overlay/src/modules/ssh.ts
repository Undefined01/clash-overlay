// substore-overlay/src/modules/ssh.ts — SSH 代理模块

import { deferred, mkOrder } from 'liboverlay';
import { GROUP_COMMON, reorderProxies, externalIcon } from '../lib/clash.js';

export default function sshModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    return {
        'proxy-groups': mkOrder(675, [
            {
                ...GROUP_COMMON,
                name: 'SSH 代理',
                type: 'select',
                proxies: deferred(() =>
                    reorderProxies(final._allSelectables as string[], 'DIRECT'),
                ),
                icon: externalIcon('fSPmETYJKmmk'),
            },
        ]),

        rules: mkOrder(675, [
            'DST-PORT,22,SSH 代理',
        ]),
    };
}
