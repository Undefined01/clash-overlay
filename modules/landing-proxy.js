// modules/landing-proxy.js — 落地代理（链式代理固定出口 IP）
//
// 用途：部分服务（如 AI）需要固定 IP 地址访问以避免被风控。
// 通过 普通代理 → 落地代理 → 目标 的链式代理实现。
//
// 落地节点通过 proxy-groups 的 dialer-proxy 字段实现链式代理：
//   dialer-proxy: "手动选择"
// 表示此代理组的出站流量通过 "手动选择" 组选中的节点中继。
//
// 提供三种模式：
//   1. 落地代理（url-test 或 select，通过链式中继）
//   2. 直出代理（不经落地，直接使用普通代理）
//   3. 手动切换（select 组，可选 落地/直出/手动选择）
//
// 需要用户自行添加落地代理节点（以 "落地" 或 "Landing" 开头的节点名）。

const { deferred } = require('../lib/lazy');
const { mkOrder } = require('../lib/lazy');
const {
    GROUP_COMMON, reorderProxies, externalIcon,
} = require('../lib/helpers');

function landingProxyModule(final, prev, ctx) {
    const proxies = ctx.config.proxies.map(p => p.name);

    // 落地代理节点通过名称过滤
    const LANDING_FILTER = "(?i)落地|Landing|固定|Residential";

    return {
        'proxy-groups': mkOrder(3, [
            // ── 落地代理（链式中继）──
            // 匹配落地节点，通过 "手动选择" 中继出去
            {
                ...GROUP_COMMON,
                name: "落地代理",
                type: "url-test",
                proxies,
                filter: LANDING_FILTER,
                "dialer-proxy": "手动选择",
                icon: externalIcon("ABvCfQAJ"),
            },

            // ── 落地切换（手动选择模式）──
            // 可选：落地代理 / 国外 AI（直出）/ 手动选择
            {
                ...GROUP_COMMON,
                name: "落地切换",
                type: "select",
                proxies: deferred(() => [
                    "落地代理",
                    "国外 AI",
                    ...final._allSelectables,
                ]),
                icon: externalIcon("ABvCfQAJ"),
            },
        ]),
    };
}

module.exports = landingProxyModule;
