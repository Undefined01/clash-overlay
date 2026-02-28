// src/modules/ai.js — 国外 AI 分流

import { dustinRule, rulesetRule } from '../lib/clash.js';
import { mkOrder } from '../lib/lazy.js';

export default function aiModule(final, prev, ctx) {
    const ai = dustinRule("ai");

    return {
        rules: mkOrder(60, [
            rulesetRule(ai.name, "落地切换"),
        ]),

        'rule-providers': {
            [ai.name]: ai.provider,
        },
    };
}
