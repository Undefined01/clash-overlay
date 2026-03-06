// substore-overlay/src/modules/ai.ts — 国外 AI 分流

import { dustinRule, rulesetRule } from '../lib/clash.js';
import { mkOrder } from 'libmodule';

export default function aiModule(): Record<string, unknown> {
    const ai = dustinRule('ai');

    return {
        rules: mkOrder(900, [
            rulesetRule(ai.name, '国外 AI'),
        ]),

        'rule-providers': {
            [ai.name]: ai.provider,
        },
    };
}
