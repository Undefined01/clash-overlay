import { makeRuleProvider, rulesetRule } from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { ruleOrder } from './order.js';

export default function applicationsModule(
    _args: ModuleArgs,
): Record<string, unknown> {
    const applications = makeRuleProvider(
        'DustinWin', 'ruleset_geodata', 'mihomo-ruleset',
        'applications.list',
    );

    return {
        rules: mkOrder(ruleOrder('applications'), [
            rulesetRule(applications, '国内直连'),
        ]),

        'rule-providers': {
            [applications.name]: applications.provider,
        },
    };
}
