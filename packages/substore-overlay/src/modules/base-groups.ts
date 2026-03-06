// substore-overlay/src/modules/base-groups.ts — 基础代理组

import type { ModuleArgs } from 'libmodule';
import { mkBefore, mkOrder } from 'libmodule';
import {
    miniIcon, qureIcon, externalIcon,
    generalGroup, PRIMITIVE_GROUPS,
} from '../lib/clash.js';
import type { ModuleContext } from './lib.js';

export default function baseGroupsModule(
    args: ModuleArgs,
): Record<string, unknown> {
    const config = args.config;
    const ctx = args.ctx as ModuleContext;
    const proxies = (ctx.originalConfig.proxies || [])
        .map(p => String(p.name || ''))
        .filter(Boolean);

    const generalGroupNames = ['手动选择', '延迟测试', '负载均衡'];

    return {
        proxies: ctx.originalConfig.proxies,
        _allSelectables: [...generalGroupNames, ...PRIMITIVE_GROUPS, ...proxies],

        _proxyGroupMap: {
            '手动选择': {
                proxies: mkOrder(100, ['延迟测试', '负载均衡']),
            },
        },

        'proxy-groups': mkBefore([
            generalGroup(config, {
                name: '手动选择',
                proxies: [...PRIMITIVE_GROUPS, ...proxies],
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
            generalGroup(config, {
                name: '国外 AI',
                type: 'url-test',
                proxies,
                filter:
                    '(?i)🇸🇬|新加坡|SG|Singapore|🇯🇵|日本|JP|Japan|🇰🇷|韩国|KR|Korea|🇺🇲|美国|US|America|United States',
                'exclude-filter':
                    '(?i)香港|HK|Hong Kong|台湾|TW|Tai Wan|官网|TG|节点|到期|流量|返利|订阅',
                icon: externalIcon('Nts60kQIvGqe'),
            }),
        ]),
    };
}
