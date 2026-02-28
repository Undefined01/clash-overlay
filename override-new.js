// override-new.js — Clash/Mihomo 覆写脚本入口
//
// 基于 Nix overlay 模型重构：每个模块独立贡献配置片段，
// 由 merge engine 按模块顺序合并，deferred 值在合并后统一解析。
//
// 模块顺序 = 规则优先级（靠前的模块规则优先匹配）。

const { parseArgs } = require('./lib/helpers');
const { mergeModules, buildClashConfig } = require('./lib/merge');

// ── 模块注册（顺序决定规则优先级）──
const modules = [
    require('./modules/general'),       // 通用配置（无规则）
    require('./modules/dns'),           // DNS 配置（无分流规则）
    require('./modules/base-groups'),   // 基础代理组（手动选择、延迟测试等）
    require('./modules/landing-proxy'), // 落地代理（链式中继固定 IP）
    require('./modules/custom'),        // 自定义规则（校园网等，最高优先级）
    require('./modules/ssh'),           // SSH 端口代理/直连切换
    require('./modules/private'),       // 私有网络 + 广告
    require('./modules/academic'),      // 学术网站 + Trackers
    require('./modules/domestic'),      // 国内直连
    require('./modules/streaming'),     // 流媒体
    require('./modules/gaming'),        // 游戏平台
    require('./modules/ai'),            // 国外 AI（→ 落地切换）
    require('./modules/proxy'),         // 国外代理 + 漏网之鱼（兜底）
];

// ── 入口函数 ──
function main(config) {
    const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
    const args = parseArgs(rawArgs);

    // 收集代理节点名称
    const rawProxies = config.proxies || [];
    const proxyNames = rawProxies.map(p => p.name);

    const ctx = { args, proxies: proxyNames, rawProxies };

    // 合并所有模块
    const merged = mergeModules(modules, ctx);

    // 追加自定义代理节点
    if (merged._extraProxies) {
        ctx.rawProxies = [...rawProxies, ...merged._extraProxies];
        // 注意：_extraProxies 的名称已在 ctx.proxies 之外，
        // 但它们通过 trafficGroup 的 deferred 引用 _allSelectables 时不会出现。
        // 需要将它们加入 rawProxies 以便 Clash 识别。
    }

    return buildClashConfig(merged, ctx);
}

module.exports = { main };

// 兼容 Clash Verge 等客户端的直接调用
if (typeof module !== "undefined") {
    module.exports = main;
}
