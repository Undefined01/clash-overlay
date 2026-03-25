import { ClashMetaConfig } from '../types/clash_meta_config.js';
import { evalModules } from 'libmodule';
import type { ModuleFn } from 'libmodule';

import * as v from 'valibot';

import clashSchema from '../modules/schema.js';
import generalModule from '../modules/general.js';
import dnsModule from '../modules/dns.js';
import baseGroupsModule from '../modules/base-groups.js';
import landingProxyModule from '../modules/landing-proxy.js';
import vpnModule from '../modules/vpn.js';
import sshModule from '../modules/ssh.js';
import privateModule from '../modules/private.js';
import applicationsModule from '../modules/applications.js';
import academicModule from '../modules/academic.js';
import domesticModule from '../modules/domestic.js';
import streamingModule from '../modules/streaming.js';
import gamingModule from '../modules/gaming.js';
import aiModule from '../modules/ai.js';
import proxyModule from '../modules/proxy.js';
import type { ModuleContext } from '../modules/lib.js';

const ModuleContextSchema = v.object({
    arguments: v.object({
        ipv6Enabled: v.optional(v.boolean(), false),
        dnsMode: v.optional(v.picklist(['fake-ip', 'redir-host']), 'fake-ip'),
    }),
    options: v.optional(v.object({})),
    originalConfig: v.any(),
});

// ── 模块注册（合并顺序 = 注册顺序，列表排序由 src/modules/order.ts 集中控制）──
const modules: Array<ModuleFn<{ ctx: ModuleContext }>> = [
    clashSchema,         // 配置选项声明（proxy-groups, proxies, rules, rule-providers）
    generalModule,       // 通用配置（标量/对象，无列表）
    dnsModule,           // DNS 配置（标量/对象，无分流规则）
    baseGroupsModule,    // 基础代理组（mkBefore = 500）
    landingProxyModule,  // 落地代理
    vpnModule,           // 校园网
    sshModule,           // SSH 端口代理
    privateModule,       // 私有网络 + 广告
    applicationsModule,  // applications.list -> 国内直连
    academicModule,      // 学术网站 + Trackers
    domesticModule,      // 国内直连
    streamingModule,     // 流媒体
    gamingModule,        // 游戏平台
    aiModule as ModuleFn,// 国外 AI — no args needed
    proxyModule,         // 国外代理 + 漏网之鱼（规则结尾仍通过 mkAfter 追加 MATCH）
];

// ── 入口函数 ──
function main(config: ClashMetaConfig): ClashMetaConfig {
    const ctx = v.parse(ModuleContextSchema, {
        arguments: typeof $arguments !== 'undefined' ? $arguments : {},
        options: typeof $options !== 'undefined' ? $options : {},
        originalConfig: config,
    });
    const base = {
        _ctx: ctx,
    };

    const merged = evalModules(
        base,
        modules,
        { args: { ctx } },
    );

    return merged as ClashMetaConfig;
}

export default main;
