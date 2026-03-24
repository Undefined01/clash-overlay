export const MODULE_ORDERS = {
    proxyGroups: {
        'landing-proxy': 600,
        vpn: 650,
        ssh: 675,
        private: 700,
        academic: 750,
        domestic: 800,
        streaming: 850,
        gaming: 875,
        proxy: 1100,
    },
    rules: {
        vpn: 650,
        ssh: 675,
        private: 700,
        applications: 725,
        academic: 750,
        ai: 775,
        streaming: 800,
        gaming: 850,
        domestic: 875,
        proxy: 1100,
    },
    proxyInsertions: {
        'base-groups.manual-select': 100,
        'landing-proxy.manual-select': 705,
    },
} as const;

export type ProxyGroupOrderModule = keyof typeof MODULE_ORDERS.proxyGroups;
export type RuleOrderModule = keyof typeof MODULE_ORDERS.rules;
export type ProxyInsertionOrderKey = keyof typeof MODULE_ORDERS.proxyInsertions;

export function proxyGroupOrder(module: ProxyGroupOrderModule): number {
    return MODULE_ORDERS.proxyGroups[module];
}

export function ruleOrder(module: RuleOrderModule): number {
    return MODULE_ORDERS.rules[module];
}

export function proxyInsertionOrder(key: ProxyInsertionOrderKey): number {
    return MODULE_ORDERS.proxyInsertions[key];
}
