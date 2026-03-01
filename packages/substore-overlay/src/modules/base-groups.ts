// substore-overlay/src/modules/base-groups.ts — 基础代理组

import { mkBefore } from 'libmodule';
import {
    miniIcon, qureIcon, externalIcon,
    generalGroup, PRIMITIVE_GROUPS,
} from '../lib/clash.js';

export default function baseGroupsModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const proxies = (config.proxies as Array<{ name?: unknown }> || [])
        .map(p => String(p.name || ''))
        .filter(Boolean);

    const generalGroupNames = ['手动选择', '延迟测试', '负载均衡'];

    return {
        _proxies: proxies,
        _allSelectables: [...generalGroupNames, ...proxies, ...PRIMITIVE_GROUPS],

        'proxy-groups': mkBefore([
            generalGroup(config, {
                name: '手动选择',
                proxies: ['延迟测试', '负载均衡', ...proxies, ...PRIMITIVE_GROUPS],
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
