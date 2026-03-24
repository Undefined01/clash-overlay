import {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, externalIcon,
} from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function academicModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    const scholar = makeRuleProvider(
        'nerdneilsfield', 'clash_rules_for_scholar', 'master',
        'rules/scholar.yaml',
    );
    const trackers = dustinRule('trackerslist');

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('academic'), [
            trafficGroup(config, '学术网站', { defaultProxy: 'DIRECT', icon: externalIcon('114326') }),
            trafficGroup(config, '种子 Trackers', { defaultProxy: '手动选择', icon: externalIcon('tdQvZGPZFFuW') }),
        ]),

        rules: mkOrder(ruleOrder('academic'), [
            rulesetRule(scholar, '学术网站'),
            rulesetRule(trackers, '种子 Trackers'),
        ]),

        'rule-providers': {
            [scholar.name]: scholar.provider,
            [trackers.name]: trackers.provider,
        },
    };
}
