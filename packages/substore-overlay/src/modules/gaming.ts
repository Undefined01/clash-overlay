// substore-overlay/src/modules/gaming.ts — 游戏平台

import { dustinRule, rulesetRule, trafficGroup, miniIcon } from '../lib/clash.js';
import { mkOrder } from 'libmodule';

export default function gamingModule(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const games = dustinRule('games');
    const gamesIp = dustinRule('gamesip');

    return {
        'proxy-groups': mkOrder(875, [
            trafficGroup(config, '游戏平台', { defaultProxy: '手动选择', icon: miniIcon('Steam') }),
        ]),

        rules: mkOrder(875, [
            rulesetRule(games.name, '游戏平台'),
            rulesetRule(gamesIp.name, '游戏平台', 'no-resolve'),
        ]),

        'rule-providers': {
            [games.name]: games.provider,
            [gamesIp.name]: gamesIp.provider,
        },
    };
}
