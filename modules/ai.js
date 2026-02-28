// modules/ai.js — 国外 AI 分流
// 代理组在 base-groups 中定义（url-test + 区域过滤），此处仅添加规则。
// 流量指向 "落地切换" 组，可在 落地代理/国外 AI 直出 间切换。

const { dustinRule, rulesetRule } = require('../lib/helpers');

module.exports = function aiModule(final, prev, ctx) {
    const ai = dustinRule("ai");

    return {
        rules: [
            rulesetRule(ai.name, "落地切换"),
        ],

        ruleProviders: {
            [ai.name]: ai.provider,
        },
    };
};
