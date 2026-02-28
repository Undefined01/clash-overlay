// override-new.js — Clash/Mihomo 覆写脚本入口
//
// 基于 Nix overlay 模型重构：每个模块独立贡献 Clash 原生配置片段，
// 由 merge engine 合并，列表元素通过 mkBefore/mkAfter/mkOrder 控制位置，
// deferred 值在合并后统一解析。
//
// 模块合并顺序 = 注册顺序。列表内元素位置由 mkOrder 控制。

const { parseArgs } = require('./lib/helpers');
const { mergeModules, cleanup } = require('./lib/merge');

// ── 模块注册（合并顺序 = 注册顺序，列表排序由 mkOrder 控制）──
const modules = [
    require('./modules/general'),       // 通用配置（标量/对象，无列表）
    require('./modules/dns'),           // DNS 配置（标量/对象，无分流规则）
    require('./modules/base-groups'),   // 基础代理组（mkBefore）
    require('./modules/landing-proxy'), // 落地代理（mkOrder 3）
    require('./modules/custom'),        // 自定义规则（mkOrder 10）
    require('./modules/ssh'),           // SSH 端口代理（mkOrder 15）
    require('./modules/private'),       // 私有网络 + 广告（mkOrder 20）
    require('./modules/academic'),      // 学术网站 + Trackers（mkOrder 30）
    require('./modules/domestic'),      // 国内直连（mkOrder 40）
    require('./modules/streaming'),     // 流媒体（mkOrder 50）
    require('./modules/gaming'),        // 游戏平台（mkOrder 55）
    require('./modules/ai'),            // 国外 AI（mkOrder 60）
    require('./modules/proxy'),         // 国外代理 + 漏网之鱼（mkOrder 90 + mkAfter）
];

// ── 入口函数 ──
function main(config) {
    const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
    const args = parseArgs(rawArgs);

    const ctx = { args, config };

    // 合并所有模块（按 order 排序）并解析 deferred 值
    const merged = mergeModules(modules, ctx);

    // 清理内部元数据（_* 键）和空对象
    return cleanup(merged);
}

module.exports = main;
