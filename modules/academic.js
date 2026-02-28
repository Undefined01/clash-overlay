// modules/academic.js — 学术网站 + 种子 Trackers

const {
    makeRuleProvider, dustinRule, rulesetRule,
    trafficGroup, externalIcon, miniIcon,
} = require('../lib/helpers');

module.exports = function academicModule(final, prev, ctx) {
    const scholar = makeRuleProvider(
        "nerdneilsfield", "clash_rules_for_scholar", "master",
        "rules/scholar.yaml",
    );
    const trackers = dustinRule("trackerslist");

    return {
        proxyGroups: [
            trafficGroup(final, "学术网站",    { defaultProxy: "DIRECT",  icon: externalIcon("114326") }),
            trafficGroup(final, "种子 Trackers", { defaultProxy: "手动选择", icon: externalIcon("tdQvZGPZFFuW") }),
        ],

        rules: [
            rulesetRule(scholar.name,  "学术网站"),
            rulesetRule(trackers.name, "种子 Trackers"),
        ],

        ruleProviders: {
            [scholar.name]:  scholar.provider,
            [trackers.name]: trackers.provider,
        },
    };
};
