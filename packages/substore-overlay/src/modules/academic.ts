// substore-overlay/src/modules/academic.ts — 学术网站 + 种子 Trackers

import {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, externalIcon,
} from '../lib/clash.js';
import { mkOrder } from 'libmodule';

export default function academicModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const scholar = makeRuleProvider(
        'nerdneilsfield', 'clash_rules_for_scholar', 'master',
        'rules/scholar.yaml',
    );
    const trackers = dustinRule('trackerslist');

    return {
        'proxy-groups': mkOrder(750, [
            trafficGroup(config, '学术网站', { defaultProxy: 'DIRECT', icon: externalIcon('114326') }),
            trafficGroup(config, '种子 Trackers', { defaultProxy: '手动选择', icon: externalIcon('tdQvZGPZFFuW') }),
        ]),

        rules: mkOrder(750, [
            rulesetRule(scholar.name, '学术网站'),
            rulesetRule(trackers.name, '种子 Trackers'),
        ]),

        'rule-providers': {
            [scholar.name]: scholar.provider,
            [trackers.name]: trackers.provider,
        },
    };
}
