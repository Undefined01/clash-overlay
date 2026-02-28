// src/index.js — Clash/Mihomo 覆写脚本入口
//
// 基于 Nix overlay 模型：每个模块独立贡献 Clash 原生配置片段，
// 由 merge engine 合并，列表元素通过 mkBefore/mkAfter/mkOrder 控制位置，
// deferred 值在合并后统一解析。

import { parseArgs } from './lib/helpers.js';
import { mergeModules, cleanup } from './lib/merge.js';

// ── 模块导入 ──
import generalModule      from './modules/general.js';
import dnsModule          from './modules/dns.js';
import baseGroupsModule   from './modules/base-groups.js';
import landingProxyModule from './modules/landing-proxy.js';
import customModule       from './modules/custom.js';
import sshModule          from './modules/ssh.js';
import privateModule      from './modules/private.js';
import academicModule     from './modules/academic.js';
import domesticModule     from './modules/domestic.js';
import streamingModule    from './modules/streaming.js';
import gamingModule       from './modules/gaming.js';
import aiModule           from './modules/ai.js';
import proxyModule        from './modules/proxy.js';

// ── 模块注册（合并顺序 = 注册顺序，列表排序由 mkOrder 控制）──
const modules = [
    generalModule,       // 通用配置（标量/对象，无列表）
    dnsModule,           // DNS 配置（标量/对象，无分流规则）
    baseGroupsModule,    // 基础代理组（mkBefore）
    landingProxyModule,  // 落地代理（mkOrder 3）
    customModule,        // 自定义规则（mkOrder 10）
    sshModule,           // SSH 端口代理（mkOrder 15）
    privateModule,       // 私有网络 + 广告（mkOrder 20）
    academicModule,      // 学术网站 + Trackers（mkOrder 30）
    domesticModule,      // 国内直连（mkOrder 40）
    streamingModule,     // 流媒体（mkOrder 50）
    gamingModule,        // 游戏平台（mkOrder 55）
    aiModule,            // 国外 AI（mkOrder 60）
    proxyModule,         // 国外代理 + 漏网之鱼（mkOrder 90 + mkAfter）
];

// ── 入口函数 ──
function main(config) {
    const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
    const args = parseArgs(rawArgs);

    const ctx = { args, config };

    const merged = mergeModules(modules, ctx);

    return cleanup(merged);
}

export default main;
