// src/modules/academic.js — 学术网站 + 种子 Trackers

import {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, externalIcon,
} from '../lib/helpers.js';
import { mkOrder } from '../lib/lazy.js';

export default function academicModule(final, prev, ctx) {
    const scholar = makeRuleProvider(
        "nerdneilsfield", "clash_rules_for_scholar", "master",
        "rules/scholar.yaml",
    );
    const trackers = dustinRule("trackerslist");

    return {
        'proxy-groups': mkOrder(30, [
            trafficGroup(final, "学术网站",    { defaultProxy: "DIRECT",  icon: externalIcon("114326") }),
            trafficGroup(final, "种子 Trackers", { defaultProxy: "手动选择", icon: externalIcon("tdQvZGPZFFuW") }),
        ]),

        rules: mkOrder(30, [
            rulesetRule(scholar.name,  "学术网站"),
            rulesetRule(trackers.name, "种子 Trackers"),
        ]),

        'rule-providers': {
            [scholar.name]:  scholar.provider,
            [trackers.name]: trackers.provider,
        },
    };
}
