import { mkBefore, mkMerge, mkOrder } from 'libmodule';
import {
    miniIcon, qureIcon,
    generalGroup, PRIMITIVE_GROUPS,
} from '../lib/clash.js';
import type { OverlayModuleArgs } from './lib.js';
import { proxyInsertionOrder } from './order.js';

export default function baseGroupsModule(
    args: OverlayModuleArgs,
): Record<string, unknown> {
    const config = args.config;
    const { ctx } = args;
    const proxies = (ctx.originalConfig.proxies || [])
        .map(p => String(p.name || ''))
        .filter(Boolean);

    const generalGroupNames = ['手动选择', '延迟测试', '负载均衡'];

    return {
        proxies: ctx.originalConfig.proxies,
        _generalProxies: proxies,
        _allSelectables: [...generalGroupNames, ...PRIMITIVE_GROUPS, ...proxies],

        'proxy-groups': mkBefore([
            generalGroup(config, {
                name: '手动选择',
                proxies: mkMerge([
                    mkOrder(proxyInsertionOrder('base-groups.manual-select'), ['延迟测试', '负载均衡']),
                    [...PRIMITIVE_GROUPS, ...proxies],
                ]),
                icon: miniIcon('Static'),
            }),
            generalGroup(config, {
                name: '延迟测试',
                type: 'url-test',
                proxies,
                icon: qureIcon('Auto'),
            }),
            generalGroup(config, {
                name: '负载均衡',
                type: 'load-balance',
                strategy: 'sticky-sessions',
                proxies,
                icon: qureIcon('Round_Robin'),
            }),
        ]),
    };
}
