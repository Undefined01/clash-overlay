import { defer, mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { GROUP_COMMON, reorderProxies, externalIcon } from '../lib/clash.js';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function sshModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    return {
        'proxy-groups': mkOrder(proxyGroupOrder('ssh'), [
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

        rules: mkOrder(ruleOrder('ssh'), [
            'DST-PORT,22,SSH 代理',
        ]),
    };
}
