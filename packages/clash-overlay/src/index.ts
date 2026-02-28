// clash-overlay/src/index.ts — Clash/Mihomo 覆写脚本入口
//
// 基于 Nix overlay 模型：每个模块独立贡献 Clash 原生配置片段，
// 由 merge engine 合并，列表元素通过 mkBefore/mkAfter/mkOrder 控制位置，
// deferred 值在合并后统一解析。

import { parseArgs } from './lib/helpers.js';
import { mergeModules, cleanup } from './lib/merge.js';
import type { ClashModule } from './lib/merge.js';

// ── 模块导入 ──
import generalModule from './modules/general.js';
import dnsModule from './modules/dns.js';
import baseGroupsModule from './modules/base-groups.js';
import landingProxyModule from './modules/landing-proxy.js';
import customModule from './modules/custom.js';
import sshModule from './modules/ssh.js';
import privateModule from './modules/private.js';
import academicModule from './modules/academic.js';
import domesticModule from './modules/domestic.js';
import streamingModule from './modules/streaming.js';
import gamingModule from './modules/gaming.js';
import aiModule from './modules/ai.js';
import proxyModule from './modules/proxy.js';

// ── 模块注册（合并顺序 = 注册顺序，列表排序由 mkOrder 控制）──
const modules: ClashModule[] = [
    generalModule,       // 通用配置（标量/对象，无列表）
    dnsModule,           // DNS 配置（标量/对象，无分流规则）
    baseGroupsModule,    // 基础代理组（mkBefore = 500）
    landingProxyModule,  // 落地代理（mkOrder 600）
    customModule,        // 自定义规则（mkOrder 650）
    sshModule,           // SSH 端口代理（mkOrder 675）
    privateModule,       // 私有网络 + 广告（mkOrder 700）
    academicModule,      // 学术网站 + Trackers（mkOrder 750）
    domesticModule,      // 国内直连（mkOrder 800）
    streamingModule,     // 流媒体（mkOrder 850）
    gamingModule,        // 游戏平台（mkOrder 875）
    aiModule,            // 国外 AI（mkOrder 900）
    proxyModule,         // 国外代理 + 漏网之鱼（mkOrder 1100 + mkAfter）
];

// ── 入口函数 ──
function main(config: Record<string, unknown>): Record<string, unknown> {
    const rawArgs = typeof $arguments !== 'undefined' ? $arguments : {};
    const args = parseArgs(rawArgs as Record<string, unknown>);

    const ctx = { args, config: config as { proxies: Array<{ name: string }> } };

    const merged = mergeModules(modules, ctx);

    return cleanup(merged);
}

// Global declaration for Clash's $arguments
declare const $arguments: Record<string, unknown>;

export default main;
