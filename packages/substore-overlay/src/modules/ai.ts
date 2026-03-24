import { dustinRule, externalIcon, generalGroup, rulesetRule } from '../lib/clash.js';
import { defer, mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { ruleOrder } from './order.js';

export default function aiModule({ config }: ModuleArgs): Record<string, unknown> {
    const ai = dustinRule('ai');

    return {
        'proxy-groups': [
            generalGroup(config, {
                name: '国外 AI',
                type: 'url-test',
                proxies: defer(() => (config._generalProxies as string[] | undefined) ?? []),
                filter:
                    '(?i)🇸🇬|新加坡|SG|Singapore|🇯🇵|日本|JP|Japan|🇰🇷|韩国|KR|Korea|🇺🇲|美国|US|America|United States',
                'exclude-filter':
                    '(?i)香港|HK|Hong Kong|台湾|TW|Tai Wan|官网|TG|节点|到期|流量|返利|订阅',
                icon: externalIcon('Nts60kQIvGqe'),
            }),
        ],

        rules: mkOrder(ruleOrder('ai'), [
            rulesetRule(ai, '国外 AI'),
        ]),

        'rule-providers': {
            [ai.name]: ai.provider,
        },
    };
}
