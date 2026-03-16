// substore-overlay/src/modules/schema.ts — Clash 配置选项声明
//
// 声明 proxy-groups, proxies, rules, rule-providers 的合并语义。
// 使 proxy-groups 按 name 合并，rules 去重，rule-providers 按 key 合并。

import { types } from 'libmodule';
import type { ModuleArgs, OptionType } from 'libmodule';

const clashSchema = (_args: ModuleArgs): Record<string, unknown> => ({
    _options: {
        'proxy-groups': {
            type: types.keyedListOf(
                (g: Record<string, unknown>) => String(g.name),
                types.submodule({
                    name:    { type: types.str as OptionType },
                    type:    { type: types.str as OptionType, default: 'select' },
                    proxies: { type: types.listOf(types.str) as OptionType, default: [] },
                }),
            ),
            default: [],
        },
        proxies: {
            type: types.keyedListOf(
                (p: Record<string, unknown>) => String(p.name),
                types.anything as OptionType<Record<string, unknown>>,
            ),
            default: [],
        },
        rules: {
            type: types.uniqueListOf(types.str),
            default: [],
        },
        'rule-providers': {
            type: types.attrsOf(types.anything),
            default: {},
        },
    },
});

export default clashSchema;
