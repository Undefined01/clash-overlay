# Clash Override 模块化覆写系统

> 基于 Nix overlay 模型，将 Clash/Mihomo 覆写脚本拆分为独立功能模块。

---

## 目录

- [一、设计概述](#一设计概述)
- [二、核心概念](#二核心概念)
- [三、项目结构](#三项目结构)
- [四、模块编写指南](#四模块编写指南)
- [五、API 参考](#五api-参考)
- [六、现有模块一览](#六现有模块一览)
- [七、进阶用法](#七进阶用法)

---

## 一、设计概述

### 1.1 背景

原始 `override.js` 为 613 行的单文件脚本，所有功能耦合在一起。
添加一个如 "Netflix 规则" 的功能需要同时修改 `buildRulesetConfig`、
`buildProxyGroupConfig` 等多个函数，散落在不同位置。

### 1.2 设计目标

**一个功能 = 一个模块文件**。所有相关配置（代理组、规则、规则集、DNS）
集中在同一个模块中：

```js
// modules/streaming.js — 一个文件包含流媒体的所有配置
module.exports = function streamingModule(final, prev, ctx) {
    const netflix = dustinRule("netflix");
    return {
        proxyGroups: [trafficGroup(final, "流媒体", { ... })],
        rules:       [rulesetRule(netflix.name, "流媒体")],
        ipRules:     [rulesetRule("netflixip", "流媒体", "no-resolve")],
        ruleProviders: { [netflix.name]: netflix.provider },
    };
};
```

### 1.3 灵感来源：Nix Overlay 模型

本系统借鉴 Nix 包管理器的 overlay 机制：

| Nix 概念 | 本系统对应 |
|----------|-----------|
| `fix` (不动点) | `applyOverlays()` 两阶段求值 |
| `final` (惰性最终结果) | `final` Proxy + `deferred()` |
| `prev` (前一层累积) | `prev` 参数（即时可用） |
| overlay 函数 | 模块函数 `(final, prev, ctx) => { ... }` |
| `composeManyExtensions` | `mergeModules()` |
| `//` (attrset merge) | `clashModuleMerge()`（数组拼接、对象合并、标量覆盖） |

**关键区别**：JavaScript 是急切求值 (eager) 的，无法像 Nix 那样对每个属性
独立惰性求值。我们通过 `deferred()` 标记 + Proxy 拦截实现类似效果：

```js
// ✗ 错误：在模块内直接读取 final 会报错
proxies: final._allSelectables   // Error!

// ✓ 正确：用 deferred() 包裹，延迟到合并完成后解析
proxies: deferred(() => final._allSelectables)  // OK
```

---

## 二、核心概念

### 2.1 两阶段求值

```
Phase 1: 依次执行模块函数，用 clashModuleMerge 合并
         ├── prev 可直接读取（已累积的结果）
         └── final 不可直接读取（Proxy 抛错）

Phase 2: 解析所有 deferred() 值
         └── 此时 final Proxy 指向完整合并结果，可正常读取
```

### 2.2 模块执行顺序

模块在 `override-new.js` 中的注册顺序决定：
1. **规则优先级**：靠前的模块规则先匹配（Clash 按序匹配，先中先停）
2. **final 可见性**：后续模块通过 `prev` 能看到前面模块的贡献

当前顺序：
```
general → dns → base-groups → landing-proxy → custom → ssh
→ private → academic → domestic → streaming → gaming → ai → proxy
```

### 2.3 合并策略

| 字段 | 类型 | 策略 | 说明 |
|------|------|------|------|
| `rules` | `string[]` | 拼接 | 靠前 = 高优先级 |
| `ipRules` | `string[]` | 拼接 | 附加在 `rules` 之后 |
| `proxyGroups` | `object[]` | 拼接 | 按模块顺序排列 |
| `ruleProviders` | `object` | 合并 | 键冲突报错 |
| `dns` | `object` | 深度合并 | 后者覆盖同名键 |
| `hosts` | `object` | 合并 | |
| `general` | `object` | 深度合并 | 端口、TUN 等 |
| `sniffer` | `object` | 深度合并 | |
| `tun` | `object` | 深度合并 | |
| `_*` (下划线前缀) | 任意 | 后者覆盖 | 模块间传递内部元数据 |

最终输出规则顺序：`rules` → `ipRules` → `MATCH,漏网之鱼`

---

## 三、项目结构

```
override/
├── override-new.js         # 入口：注册模块、导出 main()
├── override.js             # 原始脚本（参考用）
│
├── lib/
│   ├── lazy.js             # 核心：deferred()、applyOverlays()、Proxy
│   ├── merge.js            # 合并引擎：clashModuleMerge()、mergeModules()
│   └── helpers.js          # 工具：dustinRule()、trafficGroup()、图标等
│
├── modules/
│   ├── general.js          # 通用配置（端口、TUN、嗅探、Geodata）
│   ├── dns.js              # DNS 配置
│   ├── base-groups.js      # 基础代理组（手动选择、延迟测试、负载均衡、AI）
│   ├── landing-proxy.js    # 落地代理（链式中继固定 IP）
│   ├── custom.js           # 用户自定义（校园网、NJU DNS）
│   ├── ssh.js              # SSH 端口代理/直连切换
│   ├── private.js          # 私有网络 + 广告拦截
│   ├── academic.js         # 学术网站 + 种子 Trackers
│   ├── domestic.js         # 国内直连
│   ├── streaming.js        # 流媒体
│   ├── gaming.js           # 游戏平台
│   ├── ai.js               # 国外 AI（→ 落地切换）
│   └── proxy.js            # 国外代理 + 漏网之鱼（兜底）
│
├── test-lazy.js            # 惰性引擎单元测试
└── test-integration.js     # 集成测试
```

---

## 四、模块编写指南

### 4.1 模块签名

每个模块是一个函数，接收三个参数：

```js
module.exports = function myModule(final, prev, ctx) {
    return { /* contributions */ };
};
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `final` | `Proxy` | **惰性**引用，指向所有模块合并完成后的最终状态。<br>只能在 `deferred()` 回调中访问，直接读取会抛错。 |
| `prev` | `object` | 前面所有模块累积合并后的当前状态。<br>可以直接读取，用于检查已注册的组或规则。 |
| `ctx` | `object` | 共享上下文。 |

#### `ctx` 结构

```js
ctx = {
    args: {
        ipv6Enabled: boolean,  // 是否启用 IPv6（从 $arguments 解析）
        dnsMode: string,       // "fake-ip" | "redir-host"
    },
    proxies: string[],     // 订阅中所有代理节点的名称列表
    rawProxies: object[],  // 原始代理节点对象数组
};
```

### 4.2 模块返回值

模块返回一个普通对象，包含要贡献的配置片段。所有字段都是可选的：

```js
return {
    // ── Clash 配置 ──
    general: { ... },        // 合并到顶层配置
    dns:     { ... },        // 合并到 dns 段
    hosts:   { ... },        // 合并到 hosts 段
    tun:     { ... },        // 合并到 tun 段
    sniffer: { ... },        // 合并到 sniffer 段

    // ── 规则 ──
    proxyGroups:   [ ... ],  // 代理组定义（按顺序追加）
    rules:         [ ... ],  // 域名/端口规则（高优先级）
    ipRules:       [ ... ],  // IP 规则（低优先级，在 rules 之后）
    ruleProviders: { ... },  // 规则集提供者定义

    // ── 内部元数据（下划线前缀）──
    _extraProxies: [ ... ],  // 额外代理节点
    _fallbackGroup: "...",   // MATCH 兜底组名
    _proxies: [ ... ],       // 代理名称列表（供 deferred 引用）
    _allSelectables: [ ... ],// 所有可选代理（基础组 + 代理 + DIRECT/REJECT）
};
```

### 4.3 完整示例：添加一个新的流量分类

假设要添加 "社交媒体" 分流：

```js
// modules/social.js
const { dustinRule, rulesetRule, trafficGroup } = require('../lib/helpers');

module.exports = function socialModule(final, prev, ctx) {
    // 1. 声明规则集（自动创建 rule-provider）
    const telegram = dustinRule("telegram");
    const twitter  = dustinRule("twitter");

    // 2. 返回贡献
    return {
        // 代理组：select 类型，默认使用 "手动选择"
        proxyGroups: [
            trafficGroup(final, "社交媒体", {
                defaultProxy: "手动选择",
                icon: "https://example.com/social.png",
            }),
        ],

        // 域名规则
        rules: [
            rulesetRule(telegram.name, "社交媒体"),
            rulesetRule(twitter.name,  "社交媒体"),
        ],

        // IP 规则（no-resolve 避免 DNS 泄露）
        ipRules: [
            rulesetRule("telegramip", "社交媒体", "no-resolve"),
        ],

        // 规则集定义
        ruleProviders: {
            [telegram.name]: telegram.provider,
            [twitter.name]:  twitter.provider,
        },
    };
};
```

然后在 `override-new.js` 中注册：

```js
const modules = [
    ...
    require('./modules/social'),    // ← 在适当位置插入
    ...
];
```

**位置决定优先级**：放在 `streaming` 之前，则社交媒体规则优先于流媒体匹配。

### 4.4 使用 `deferred()` 引用最终结果

当代理组的 `proxies` 列表需要包含所有可选代理时，必须使用 `deferred()`：

```js
const { deferred } = require('../lib/lazy');

// ✗ 错误：此时 final._allSelectables 尚未准备好
proxies: final._allSelectables

// ✓ 正确：延迟到合并完成后解析
proxies: deferred(() => final._allSelectables)

// ✓ 也可以在 deferred 内做变换
proxies: deferred(() => [
    "优先代理",
    ...final._allSelectables.filter(p => p !== "REJECT"),
])
```

**何时需要 `deferred()`**：
- 引用 `final` 的任何属性
- 引用其他模块贡献的字段（因为在当前模块执行时它们可能还没合并进来）

**何时不需要**：
- 使用 `prev`（已经可用）
- 使用 `ctx`（外部传入，不受合并影响）
- 使用常量或本模块内部计算的值

### 4.5 使用 `prev` 感知上下文

通过 `prev` 查看前面模块已贡献的内容：

```js
module.exports = function myModule(final, prev, ctx) {
    // 检查前面是否已定义某个代理组
    const hasStreaming = prev.proxyGroups.some(g => g.name === "流媒体");

    // 根据已有规则数量调整行为
    console.log(`当前已有 ${prev.rules.length} 条规则`);

    return { ... };
};
```

### 4.6 添加自定义代理节点

通过 `_extraProxies` 元数据字段添加额外代理节点：

```js
return {
    _extraProxies: [
        { name: "my-socks", type: "socks5", server: "127.0.0.1", port: 1080 },
    ],
};
```

这些节点会被追加到 `config.proxies`，Clash 可识别并使用。

### 4.7 修改 DNS 配置

DNS 配置通过深度合并实现叠加：

```js
return {
    dns: {
        "nameserver-priority": {
            "+.my-school.edu.cn": "system",
        },
    },
};
```

多个模块都可以向 `dns` 贡献配置，它们会被深度合并。

---

## 五、API 参考

### 5.1 `lib/lazy.js` — 惰性求值引擎

#### `deferred(fn)`

标记一个值为延迟解析。`fn` 是一个无参回调，在所有模块合并完成后调用。

```js
const { deferred } = require('./lib/lazy');
deferred(() => final._allSelectables)
```

#### `applyOverlays(base, overlays, options?)`

将 overlay 函数数组依次应用到 base 上，返回合并 + 解析后的结果。

```js
const result = applyOverlays(
    { a: 1 },
    [
        (final, prev) => ({ b: prev.a + 1 }),
        (final, prev) => ({ c: deferred(() => final.b + 10) }),
    ]
);
// => { a: 1, b: 2, c: 12 }
```

#### `makeExtensible(base)`

创建可链式扩展的对象：

```js
let obj = makeExtensible({ a: 1 });
obj = obj.extend((final, prev) => ({ b: prev.a + 1 }));
// obj => { a: 1, b: 2, extend: [Function] }
```

### 5.2 `lib/merge.js` — 合并引擎

#### `mergeModules(modules, ctx)`

合并所有模块，返回解析后的内部状态对象。

```js
const merged = mergeModules([mod1, mod2, mod3], ctx);
```

#### `buildClashConfig(merged, ctx)`

将内部状态转换为 Clash 识别的配置格式。

```js
const config = buildClashConfig(merged, ctx);
// => { mixed-port, dns, proxies, proxy-groups, rules, rule-providers, ... }
```

### 5.3 `lib/helpers.js` — 工具函数

#### 规则集

| 函数 | 签名 | 说明 |
|------|------|------|
| `dustinRule(name)` | `→ { name, provider }` | DustinWin 规则集快捷方式 |
| `makeRuleProvider(owner, repo, branch, path, overrides?)` | `→ { name, provider }` | 创建任意来源的规则集 |
| `rulesetRule(name, proxy, ...opts)` | `→ string` | 生成 `RULE-SET,name,proxy` 规则字符串 |

```js
const { dustinRule, makeRuleProvider, rulesetRule } = require('./lib/helpers');

const ai = dustinRule("ai");
// ai.name     => "ai"
// ai.provider => { type: "http", behavior: "domain", format: "mrs", url: "...", ... }

const scholar = makeRuleProvider(
    "nerdneilsfield", "clash_rules_for_scholar", "master",
    "rules/scholar.yaml"
);

rulesetRule(ai.name, "国外 AI")           // => "RULE-SET,ai,国外 AI"
rulesetRule("cnip", "国内直连", "no-resolve") // => "RULE-SET,cnip,国内直连,no-resolve"
```

#### 代理组

| 函数 | 说明 |
|------|------|
| `trafficGroup(final, name, opts)` | 创建流量代理组（proxies 自动 deferred） |
| `generalGroup(final, opts)` | 创建基础代理组 |
| `reorderProxies(proxies, defaultProxy)` | 将 defaultProxy 移到列表首位 |

```js
const { trafficGroup, generalGroup, qureIcon } = require('./lib/helpers');

// 流量组：proxies 自动从 final._allSelectables 获取
trafficGroup(final, "我的组", {
    defaultProxy: "手动选择",  // 默认选中
    icon: "Netflix",           // Qure 图标名（或完整 URL）
})

// 基础组：显式指定 proxies
generalGroup(final, {
    name: "自动测试",
    type: "url-test",
    proxies: ctx.proxies,      // 显式列表
    icon: qureIcon("Auto"),
})
```

#### `trafficGroup(final, name, opts)` 详细说明

创建一个流量代理组。`proxies` 字段自动使用 `deferred()` 从 `final._allSelectables`
获取，并将 `defaultProxy` 置为首位。

参数：

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `defaultProxy` | `string` | 是 | 默认选中的代理/组名 |
| `icon` | `string` | 是 | 图标 URL 或 Qure 图标名 |
| `...overrides` | `object` | 否 | 覆盖 `GROUP_COMMON` 的属性（如 `type`、`filter` 等） |

返回一个代理组配置对象，可直接放入 `proxyGroups` 数组。

#### 图标

| 函数 | 示例 |
|------|------|
| `miniIcon(name)` | `miniIcon("Static")` → Orz-3/mini 仓库的图标 |
| `qureIcon(name)` | `qureIcon("Netflix")` → Koolson/Qure 仓库的图标 |
| `externalIcon(id)` | `externalIcon("Nts60kQIvGqe")` → icons8.com 的图标 |
| `getGithub(owner, repo, branch, path)` | jsdelivr CDN URL |

#### 工具

| 函数 | 说明 |
|------|------|
| `parseArgs(rawArgs)` | 解析 `$arguments` 为 `{ ipv6Enabled, dnsMode }` |
| `mergeList(...items)` | 合并多个数组/值，过滤 falsy |

### 5.4 常量

```js
const { GROUP_COMMON, PRIMITIVE_GROUPS } = require('./lib/helpers');

GROUP_COMMON
// => { type: "select", url: "...", interval: 300, tolerance: 50, "max-failed-times": 2 }

PRIMITIVE_GROUPS
// => ["DIRECT", "REJECT"]
```

### 5.5 内部状态字段（`_` 前缀）

这些字段在模块间传递元数据，不会出现在最终 Clash 配置中：

| 字段 | 定义模块 | 说明 |
|------|----------|------|
| `_proxies` | base-groups | 原始代理节点名称列表 |
| `_allSelectables` | base-groups | 基础组 + 代理 + DIRECT/REJECT |
| `_extraProxies` | custom | 额外代理节点（追加到 config.proxies） |
| `_fallbackGroup` | proxy | MATCH 兜底组名 |

---

## 六、现有模块一览

### 基础设施模块（无分流规则）

| 模块 | 功能 |
|------|------|
| **general** | 入站端口、外部控制、TUN、Geodata、嗅探器 |
| **dns** | DNS 服务器、fake-ip、hosts |
| **base-groups** | 手动选择、延迟测试、负载均衡、国外 AI 代理组 |

### 特殊功能模块

| 模块 | 代理组 | 规则 | 说明 |
|------|--------|------|------|
| **landing-proxy** | 落地代理, 落地切换 | — | 链式代理固定出口 IP |
| **custom** | 校园网 | IP-CIDR 规则 | 校园网、特殊 IP、NJU DNS |
| **ssh** | SSH 代理 | DST-PORT,22 | SSH 连接代理/直连切换 |

### 流量分类模块

| 模块 | 代理组 | 默认代理 | 规则集 |
|------|--------|----------|--------|
| **private** | 私有网络, 广告 | DIRECT, REJECT | private, ads, privateip |
| **academic** | 学术网站, 种子 Trackers | DIRECT, 手动选择 | scholar, trackerslist |
| **domestic** | 国内直连 | DIRECT | cn, cnip, applications, *-cn |
| **streaming** | 流媒体 | 手动选择 | netflix, disney, youtube, ... |
| **gaming** | 游戏平台 | 手动选择 | games, gamesip |
| **ai** | *(→ 落地切换)* | — | ai |
| **proxy** | 国外代理, 漏网之鱼 | 手动选择 | proxy, networktest, tld-proxy, telegramip |

### 落地代理工作原理

```
用户 ─→ 手动选择（普通代理）─→ 落地代理节点 ─→ 目标网站
            ↑ dialer-proxy           ↑ filter 匹配落地节点
```

`落地代理` 组使用 `dialer-proxy: "手动选择"` 实现链式中继。
Clash 会先通过 "手动选择" 连接到普通代理服务器，
再从普通代理连接到落地代理节点，最终访问目标网站。

这样目标网站看到的 IP 始终是落地代理节点的，不会因为切换普通代理而变化。

`落地切换` 组允许在三种模式间切换：
- **落地代理**：通过链式中继访问（固定 IP）
- **国外 AI**：直接通过 AI 专用代理组（不固定 IP，但低延迟）
- **手动选择 / 其他**：自由选择任意代理

### SSH 代理工作原理

`SSH 代理` 组捕获所有 22 端口流量（`DST-PORT,22`），
提供 select 类型组让用户切换：
- **DIRECT**（默认）：直连，适用于内网 SSH
- **手动选择**：通过代理，适用于访问境外 SSH 服务

---

## 七、进阶用法

### 7.1 条件模块

根据运行时参数决定是否启用模块：

```js
// override-new.js
const modules = [
    ...baseModules,
    ctx.args.enableLanding && require('./modules/landing-proxy'),
    require('./modules/proxy'),
].filter(Boolean);
```

### 7.2 模块间依赖

通过 `prev` 实现松耦合依赖：

```js
// 在某个模块中检查 landing-proxy 是否启用
module.exports = function myModule(final, prev, ctx) {
    const hasLanding = prev.proxyGroups.some(g => g.name === "落地切换");
    const aiTarget = hasLanding ? "落地切换" : "国外 AI";

    return {
        rules: [rulesetRule(ai.name, aiTarget)],
    };
};
```

### 7.3 覆盖前面模块的值

后面的模块可以通过返回同名标量字段来覆盖前面模块的值：

```js
// 覆盖 general 中的端口
return {
    general: { "mixed-port": 7891 },  // 深度合并，覆盖端口
};
```

### 7.4 自定义规则集来源

使用 `makeRuleProvider` 支持任意 GitHub 仓库：

```js
const { makeRuleProvider, rulesetRule } = require('../lib/helpers');

const myRule = makeRuleProvider(
    "my-org", "my-rules", "main",
    "rules/custom.yaml"
);

return {
    rules: [rulesetRule(myRule.name, "我的组")],
    ruleProviders: { [myRule.name]: myRule.provider },
};
```

### 7.5 纯规则模块（无代理组）

有时只需添加规则到已有代理组，无需创建新组：

```js
// 纯规则模块 — 将 AI 规则指向已有的 "落地切换" 组
module.exports = function aiModule(final, prev, ctx) {
    const ai = dustinRule("ai");
    return {
        rules:         [rulesetRule(ai.name, "落地切换")],
        ruleProviders: { [ai.name]: ai.provider },
    };
};
```

### 7.6 链式代理（dialer-proxy）

通过 Clash 的 `dialer-proxy` 字段实现代理链：

```js
proxyGroups: [{
    ...GROUP_COMMON,
    name: "我的链式代理",
    type: "url-test",
    proxies: ctx.proxies,
    filter: "(?i)特殊节点",
    "dialer-proxy": "手动选择",  // 出站流量先经过 "手动选择"
}],
```

流量路径：`用户 → 手动选择的节点 → filter 匹配的节点 → 目标`

### 7.7 端口级规则

使用 `DST-PORT` 匹配特定端口的流量：

```js
rules: [
    "DST-PORT,22,SSH 代理",         // 所有 22 端口
    "DST-PORT,3389,远程桌面",        // RDP
],
```

也可以使用 `AND` 组合规则：

```js
rules: [
    "AND,((DOMAIN,github.com),(DST-PORT,22)),DIRECT",
]
```

---

## 附录：Nix 到 JavaScript 的适配

### 问题

Nix 的惰性求值让 `fix(self => { a = 1; b = self.a + 2; })` 自然工作。
JavaScript 急切求值，`{ a: 1, b: self.a + 2 }` 在对象构造时立即执行，
`self` 尚未完成，导致无限递归。

### 解决方案

两阶段求值 + `deferred()` 标记：

1. **Phase 1**：依次执行模块，`prev` 即时可用，`final` Proxy 拦截一切访问并报错
2. **Phase 2**：合并完成后，`final` Proxy 指向完整结果，解析所有 `deferred()` 值

这使得 `deferred(() => final.xxx)` 在概念上等同于 Nix 的 `final.xxx`，
只是需要显式标记惰性边界。

### 对比

| | Nix | JavaScript (本系统) |
|---|---|---|
| 惰性 | 隐式，每个属性独立惰性 | 显式，需用 `deferred()` 标记 |
| 访问 `final` | 任何位置 | 仅在 `deferred()` 内 |
| 访问 `prev` | 任何位置 | 任何位置 |
| 循环依赖 | 运行时报错 | Phase 2 解析时报错 |
| 合并策略 | `//` 浅合并 | `clashModuleMerge` 智能合并 |
