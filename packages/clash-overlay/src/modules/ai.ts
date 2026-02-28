// clash-overlay/src/modules/ai.ts — 国外 AI 分流

import { dustinRule, rulesetRule } from '../lib/clash.js';
import { mkOrder } from 'liboverlay';

export default function aiModule(
    _final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    const ai = dustinRule('ai');

    return {
        rules: mkOrder(900, [
            rulesetRule(ai.name, '落地切换'),
        ]),

        'rule-providers': {
            [ai.name]: ai.provider,
        },
    };
}
