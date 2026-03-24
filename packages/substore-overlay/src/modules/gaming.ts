import { dustinRule, rulesetRule, trafficGroup, miniIcon } from '../lib/clash.js';
import { mkOrder } from 'libmodule';
import type { ModuleArgs } from 'libmodule';
import { proxyGroupOrder, ruleOrder } from './order.js';

export default function gamingModule(
    { config }: ModuleArgs,
): Record<string, unknown> {
    const games = dustinRule('games');
    const gamesIp = dustinRule('gamesip');

    return {
        'proxy-groups': mkOrder(proxyGroupOrder('gaming'), [
            trafficGroup(config, '游戏平台', { defaultProxy: '手动选择', icon: miniIcon('Steam') }),
        ]),

        rules: mkOrder(ruleOrder('gaming'), [
            rulesetRule(games, '游戏平台'),
            rulesetRule(gamesIp, '游戏平台'),
        ]),

        'rule-providers': {
            [games.name]: games.provider,
            [gamesIp.name]: gamesIp.provider,
        },
    };
}
