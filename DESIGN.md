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
添加一个如 "Netflix 规则" 的功能需要同时修改多个函数，散落在不同位置。

### 1.2 设计目标

**一个功能 = 一个模块文件**。所有相关配置（代理组、规则、规则集、DNS）
集中在同一个模块中，并且模块直接产出 Clash 原生配置键：

```js
// modules/streaming.js — 一个文件包含流媒体的所有配置
const { dustinRule, rulesetRule, trafficGroup, qureIcon } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

function streamingModule(final, prev, ctx) {
    const netflix = dustinRule("netflix");
    return {
        'proxy-groups': mkOrder(50, [
            trafficGroup(final, "流媒体", {
                defaultProxy: "手动选择",
                icon: qureIcon("Netflix"),       // 必须为完整 URL
            }),
        ]),
        rules: mkOrder(50, [
            rulesetRule(netflix.name, "流媒体"),
            rulesetRule("netflixip", "流媒体", "no-resolve"),
        ]),
        'rule-providers': { [netflix.name]: netflix.provider },
    };
}
module.exports = streamingModule;
```

### 1.3 灵感来源：Nix Overlay 模型

本系统借鉴 Nix 包管理器的 overlay 机制：

| Nix 概念 | 本系统对应 |
|----------|-----------|
| `fix` (不动点) | `applyOverlays()` 两阶段求值 |
| `final` (惰性最终结果) | `final` Proxy + `deferred()` |
| `prev` (前一层累积) | `prev` 参数（即时可用） |
| overlay 函数 | 模块函数 `(final, prev, ctx) => { ... }` |
| `composeManyExtensions` | `mergeModules()`（按注册顺序合并） |
| `//` (attrset merge) | `clashModuleMerge()`（有序列表、对象合并、标量冲突检测） |
| `mkDefault` / `mkForce` | `mkDefault()` / `mkForce()` / `mkOverride()`（标量冲突控制） |
| list ordering | `mkBefore()` / `mkAfter()` / `mkOrder()`（列表元素排序） |

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
Phase 1: 按注册顺序依次执行模块，用 clashModuleMerge 合并
         ├── prev 可直接读取（已累积的结果）
         ├── final 不可直接读取（Proxy 抛错）
         └── 数组贡献携带 order 信息（mkOrder/mkBefore/mkAfter）

Phase 2: 解析所有 deferred() 值 + 按 order 排序并展平有序列表
         └── 此时 final Proxy 指向完整合并结果，可正常读取
```

### 2.2 列表排序（mkBefore / mkAfter / mkOrder）

模块通过包装器控制其列表元素在最终配置中的**位置**。
不同模块对同一列表字段的贡献，按 order 排序后展平：

```js
// Module A: rules 放在最前
rules: mkBefore(["IP-CIDR,10.0.0.0/8,DIRECT"])

// Module B: rules 放在 order=30 的位置
rules: mkOrder(30, ["RULE-SET,scholar,学术网站"])

// Module C: 无包装 = 默认 order 100
rules: ["RULE-SET,proxy,国外代理"]

// Module D: rules 放在最后
rules: mkAfter(["MATCH,漏网之鱼"])

// 最终结果（按 order 排序）：
// 0:     IP-CIDR,10.0.0.0/8,DIRECT    (mkBefore = order 0)
// 30:    RULE-SET,scholar,学术网站       (mkOrder 30)
// 100:   RULE-SET,proxy,国外代理         (默认 order 100)
// 10000: MATCH,漏网之鱼                  (mkAfter = order 10000)
```

| 包装器 | order 值 | 用途 |
|--------|----------|------|
| `mkBefore(items)` | 0 | 放在列表最前 |
| `mkOrder(n, items)` | n | 指定位置 |
| *(无包装)* | 100 | 默认位置 |
| `mkAfter(items)` | 10000 | 放在列表最后 |

**推荐 order 约定**：

| order | 说明 | 示例 |
|-------|------|------|
| 0 (mkBefore) | 基础代理组 | base-groups |
| 3 | 功能代理组 | landing-proxy |
| 10–19 | 高优先级规则 | custom(10), ssh(15) |
| 20–29 | 网络环境 | private(20) |
| 30–39 | 学术/特殊 | academic(30) |
| 40–49 | 国内 | domestic(40) |
| 50–59 | 流媒体/游戏 | streaming(50), gaming(55) |
| 60–69 | AI | ai(60) |
| 90 | 兜底代理规则 | proxy(90) |
| 10000 (mkAfter) | 绝对置底 | MATCH 规则 |

相同 order 的段按模块注册顺序排列。

**混合形式**：一个模块可以对同一字段贡献多个不同 order 的段：

```js
// proxy.js — 主体规则 order=90，MATCH 用 mkAfter 绝对置底
rules: [
    mkOrder(90, [
        rulesetRule("proxy", "国外代理"),
        rulesetRule("cn", "国内直连"),
    ]),
    mkAfter(["MATCH,漏网之鱼"]),
]
```

### 2.3 标量冲突与优先级控制

标量值（字符串、数字、布尔）在多个模块间的冲突规则：

| 情况 | 结果 |
|------|------|
| 值相同 | ✓ ok（幂等） |
| `mkDefault` + `mkOverride`（值不同） | ✓ `mkOverride` 胜出（**唯一允许的静默覆盖**） |
| 其他组合（值不同） | ✗ 抛错 |

```js
// ✓ mkDefault 被 mkOverride 覆盖
moduleA: { port: mkDefault(7890) }
moduleB: { port: mkOverride(8080) }   // → 8080

// ✗ mkDefault 被普通值 → 报错（必须用 mkOverride 明确覆盖）
moduleA: { port: mkDefault(7890) }
moduleB: { port: 8080 }               // → Error!

// ✗ mkForce 被任何不同值 → 报错
moduleA: { mode: mkForce("rule") }
moduleB: { mode: "direct" }           // → Error!

// ✓ mkForce 与相同值 → ok
moduleA: { mode: mkForce("rule") }
moduleB: { mode: "rule" }             // → "rule"
```

| 包装器 | 语义 |
|--------|------|
| `mkDefault(value)` | 提供默认值，只能被 `mkOverride` 覆盖 |
| `mkForce(value)` | 断言值不可变，任何不同值都报错 |
| `mkOverride(value)` | 明确覆盖 `mkDefault`，其他情况同普通值 |
| *(无包装)* | 普通值，与其他普通值冲突时报错 |

### 2.4 合并策略总览

| 类型 | 策略 | 示例键 |
|------|------|--------|
| 数组 | 有序段收集 → 按 order 排序 → 展平 | `rules`, `proxy-groups`, `proxies` |
| 对象 | 深度合并 | `dns`, `hosts`, `tun`, `sniffer` |
| 对象（特殊） | 合并 + 键冲突报错 | `rule-providers` |
| 标量 | 值相同 → ok；不同 → 见 §2.3 冲突规则 | `mixed-port`, `mode`, `ipv6` |
| `_*` 前缀 | 后者覆盖（不做有序列表处理） | `_proxies`, `_allSelectables` |

---

## 三、项目结构

```
override/
├── override-new.js         # 入口：注册模块、导出 main()
├── override.js             # 原始脚本（参考用）
│
├── lib/
│   ├── lazy.js             # 核心：deferred()、mkDefault/mkForce/mkOverride、
│   │                       #       mkBefore/mkAfter/mkOrder、applyOverlays()
│   ├── merge.js            # 合并引擎：clashModuleMerge()、mergeModules()、cleanup()
│   └── helpers.js          # 工具：dustinRule()、trafficGroup()、图标等
│
├── modules/
│   ├── general.js          # 入站端口、TUN、Geodata、嗅探（标量/对象）
│   ├── dns.js              # DNS 配置（标量/对象）
│   ├── base-groups.js      # 手动选择、延迟测试、负载均衡、国外 AI（mkBefore）
│   ├── landing-proxy.js    # 落地代理（mkOrder 3）
│   ├── custom.js           # 校园网、自定义规则（mkOrder 10）
│   ├── ssh.js              # SSH 端口代理（mkOrder 15）
│   ├── private.js          # 私有网络 + 广告拦截（mkOrder 20）
│   ├── academic.js         # 学术网站 + 种子 Trackers（mkOrder 30）
│   ├── domestic.js         # 国内直连（mkOrder 40）
│   ├── streaming.js        # 流媒体（mkOrder 50）
│   ├── gaming.js           # 游戏平台（mkOrder 55）
│   ├── ai.js               # 国外 AI（mkOrder 60）
│   └── proxy.js            # 国外代理 + 漏网之鱼（mkOrder 90 + mkAfter）
│
├── test-lazy.js            # 单元测试（20 项）
└── test-integration.js     # 集成测试
```

---

## 四、模块编写指南

### 4.1 模块签名

每个模块是一个函数，接收三个参数：

```js
const { mkOrder } = require('../lib/lazy');

function myModule(final, prev, ctx) {
    return {
        'proxy-groups': mkOrder(50, [ /* ... */ ]),
        rules: mkOrder(50, [ /* ... */ ]),
        'rule-providers': { /* ... */ },
    };
}
module.exports = myModule;
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
        ipv6Enabled: boolean,  // 是否启用 IPv6
        dnsMode: string,       // "fake-ip" | "redir-host"
    },
    config: object,            // 原始 Clash 配置（来自订阅）
    // config.proxies: object[] — 订阅代理节点数组
};
```

### 4.2 模块返回值

模块返回一个对象，包含 **Clash 原生配置键**。所有字段可选：

```js
return {
    // ── Clash 顶层标量 ──
    "mixed-port": 7890,
    "allow-lan": true,
    mode: "rule",

    // ── Clash 顶层对象（深度合并）──
    dns:     { ... },
    hosts:   { ... },
    tun:     { ... },
    sniffer: { ... },

    // ── Clash 列表（有序段合并）──
    proxies:        [ ... ],              // 额外代理节点（默认 order 100）
    'proxy-groups': mkOrder(50, [ ... ]), // 代理组（指定 order）
    rules:          mkOrder(50, [ ... ]), // 规则（指定 order）

    // ── Clash 映射（合并，键冲突报错）──
    'rule-providers': { ... },

    // ── 内部元数据（_前缀，不进入最终配置）──
    _proxies: [ ... ],
    _allSelectables: [ ... ],
};
```

### 4.3 完整示例：添加一个新的流量分类

假设要添加 "社交媒体" 分流：

```js
// modules/social.js
const { dustinRule, rulesetRule, trafficGroup, qureIcon } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

function socialModule(final, prev, ctx) {
    const telegram = dustinRule("telegram");
    const twitter  = dustinRule("twitter");

    return {
        'proxy-groups': mkOrder(52, [
            trafficGroup(final, "社交媒体", {
                defaultProxy: "手动选择",
                icon: qureIcon("Telegram"),  // 必须为完整 URL
            }),
        ]),

        rules: mkOrder(52, [
            rulesetRule(telegram.name, "社交媒体"),
            rulesetRule(twitter.name,  "社交媒体"),
            rulesetRule("telegramip", "社交媒体", "no-resolve"),
        ]),

        'rule-providers': {
            [telegram.name]: telegram.provider,
            [twitter.name]:  twitter.provider,
        },
    };
}

module.exports = socialModule;
```

然后在 `override-new.js` 中注册：

```js
const modules = [
    ...
    require('./modules/social'),   // 社交媒体（mkOrder 52）
    ...
];
```

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
- 引用其他模块贡献的字段

**何时不需要**：
- 使用 `prev`（已经可用）
- 使用 `ctx`（外部传入）
- 使用常量或本模块内部计算的值

### 4.5 使用 `prev` 感知上下文

通过 `prev` 查看前面模块已贡献的内容：

```js
function myModule(final, prev, ctx) {
    // 注意：prev 中的列表是有序段（__orderedList），不是最终数组
    console.log(`ctx.config 有 ${ctx.config.proxies.length} 个代理`);
    return { ... };
}
```

### 4.6 添加自定义代理节点

通过 `proxies` 数组拼接添加额外代理节点：

```js
return {
    proxies: [
        { name: "my-socks", type: "socks5", server: "127.0.0.1", port: 1080 },
    ],
};
```

这些节点会被拼接到原始 `config.proxies` 之后。

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

### 5.1 `lib/lazy.js` — 惰性求值 + 包装器

#### `deferred(fn)`

标记一个值为延迟解析。`fn` 是一个无参回调，在所有模块合并完成后调用。

```js
deferred(() => final._allSelectables)
```

#### 标量优先级包装器

| 函数 | 语义 |
|------|------|
| `mkDefault(value)` | 默认值，只能被 `mkOverride` 覆盖 |
| `mkForce(value)` | 断言值不可变，任何不同值报错 |
| `mkOverride(value)` | 明确覆盖 `mkDefault`，其他不同值报错 |

```js
return { "mixed-port": mkDefault(7890) };  // 可被 mkOverride 覆盖
return { mode: mkForce("rule") };          // 任何不同值都报错
return { "mixed-port": mkOverride(8080) }; // 覆盖 mkDefault(7890)
```

#### 列表排序包装器

| 函数 | order | 用途 |
|------|-------|------|
| `mkBefore(items)` | 0 | 列表最前 |
| `mkOrder(n, items)` | n | 指定位置 |
| `mkAfter(items)` | 10000 | 列表最后 |

```js
rules: mkOrder(50, ["RULE-SET,netflix,流媒体"])  // order 50
rules: mkBefore(["IP-CIDR,10.0.0.0/8,DIRECT"])  // 最前
rules: mkAfter(["MATCH,漏网之鱼"])               // 最后
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

### 5.2 `lib/merge.js` — 合并引擎

#### `mergeModules(modules, ctx)`

按注册顺序合并所有模块，返回解析后的 Clash 配置。
列表字段按 mkOrder 排序后展平。

```js
const merged = mergeModules([mod1, mod2, mod3], ctx);
```

#### `cleanup(config)`

移除 `_*` 内部元数据键和空对象，得到最终 Clash 配置。

```js
const config = cleanup(merged);
```

### 5.3 `lib/helpers.js` — 工具函数

#### 规则集

| 函数 | 签名 | 说明 |
|------|------|------|
| `dustinRule(name)` | `→ { name, provider }` | DustinWin 规则集快捷方式 |
| `makeRuleProvider(owner, repo, branch, path, overrides?)` | `→ { name, provider }` | 创建任意来源的规则集 |
| `rulesetRule(name, proxy, ...opts)` | `→ string` | 生成 `RULE-SET,name,proxy` 规则字符串 |

#### 代理组

| 函数 | 说明 |
|------|------|
| `trafficGroup(final, name, opts)` | 创建流量代理组（proxies 自动 deferred） |
| `generalGroup(final, opts)` | 创建基础代理组 |
| `reorderProxies(proxies, defaultProxy)` | 将 defaultProxy 移到列表首位 |

`trafficGroup` 的 `icon` 参数**必须为完整 URL**，不会自动转换。
使用 `qureIcon()`、`miniIcon()`、`externalIcon()` 等函数生成 URL。

#### 图标

| 函数 | 示例 |
|------|------|
| `miniIcon(name)` | `miniIcon("Static")` → Orz-3/mini 仓库的图标 |
| `qureIcon(name)` | `qureIcon("Netflix")` → Koolson/Qure 仓库的图标 |
| `externalIcon(id)` | `externalIcon("Nts60kQIvGqe")` → icons8.com 的图标 |
| `getGithub(owner, repo, branch, path)` | jsdelivr CDN URL |

### 5.4 内部状态字段（`_` 前缀）

这些字段在模块间传递元数据，经 `cleanup()` 后不会出现在最终 Clash 配置中：

| 字段 | 定义模块 | 说明 |
|------|----------|------|
| `_proxies` | base-groups | 原始代理节点名称列表 |
| `_allSelectables` | base-groups | 基础组 + 代理 + DIRECT/REJECT |

---

## 六、现有模块一览

### 基础设施模块（无分流规则）

| 模块 | 列表 order | 功能 |
|------|-----------|------|
| **general** | *(无列表)* | 入站端口、外部控制、TUN、Geodata、嗅探器 |
| **dns** | *(无列表)* | DNS 服务器、fake-ip、hosts |
| **base-groups** | mkBefore | 手动选择、延迟测试、负载均衡、国外 AI 代理组 |

### 特殊功能模块

| 模块 | 列表 order | 代理组 | 规则 | 说明 |
|------|-----------|--------|------|------|
| **landing-proxy** | 3 | 落地代理, 落地切换 | — | 链式代理固定出口 IP |
| **custom** | 10 | 校园网 | IP-CIDR 规则 | 校园网、特殊 IP、NJU DNS |
| **ssh** | 15 | SSH 代理 | DST-PORT,22 | SSH 连接代理/直连切换 |

### 流量分类模块

| 模块 | 列表 order | 代理组 | 默认代理 | 规则集 |
|------|-----------|--------|----------|--------|
| **private** | 20 | 私有网络, 广告 | DIRECT, REJECT | private, ads, privateip |
| **academic** | 30 | 学术网站, 种子 Trackers | DIRECT, 手动选择 | scholar, trackerslist |
| **domestic** | 40 | 国内直连 | DIRECT | cnip, applications, *-cn |
| **streaming** | 50 | 流媒体 | 手动选择 | netflix, disney, youtube, ... |
| **gaming** | 55 | 游戏平台 | 手动选择 | games, gamesip |
| **ai** | 60 | *(→ 落地切换)* | — | ai |
| **proxy** | 90 + mkAfter | 国外代理, 漏网之鱼 | 手动选择 | proxy, networktest, tld-proxy, telegramip, cn + MATCH |

### 落地代理工作原理

```
用户 ─→ 手动选择（普通代理）─→ 落地代理节点 ─→ 目标网站
            ↑ dialer-proxy           ↑ filter 匹配落地节点
```

`落地代理` 组使用 `dialer-proxy: "手动选择"` 实现链式中继。
`落地切换` 组允许在 落地代理 / 国外 AI / 手动选择 间切换。

---

## 七、进阶用法

### 7.1 条件模块

根据运行时参数决定是否启用模块：

```js
const modules = [
    ...baseModules,
    ctx.args.enableLanding && require('./modules/landing-proxy'),
    require('./modules/proxy'),
].filter(Boolean);
```

### 7.2 模块间依赖

通过 `prev` 实现松耦合依赖：

```js
function myModule(final, prev, ctx) {
    // 检查是否有落地切换组（注意 prev 中列表是有序段结构）
    const hasLanding = ctx.config.proxies.some(p => /落地|Landing/i.test(p.name));
    const aiTarget = hasLanding ? "落地切换" : "国外 AI";
    return {
        rules: mkOrder(60, [rulesetRule(ai.name, aiTarget)]),
    };
}
```

### 7.3 使用 mkDefault 提供可覆盖的默认值

```js
const { mkDefault, mkOverride } = require('../lib/lazy');

// 模块 A：提供默认端口
return { "mixed-port": mkDefault(7890) };

// 模块 B：明确覆盖（必须用 mkOverride，普通值会报错）
return { "mixed-port": mkOverride(8080) };
```

### 7.4 使用 mkForce 断言配置

```js
const { mkForce } = require('../lib/lazy');

// mode 必须为 "rule"，任何其他模块设不同值都会报错
return { mode: mkForce("rule") };

// 但相同值不报错（幂等）
return { mode: "rule" };  // ✓ ok
```

### 7.5 混合 order 的列表贡献

一个模块可以对同一字段贡献多个不同 order 的段：

```js
const { mkOrder, mkAfter } = require('../lib/lazy');

// proxy.js 的 rules：主体在 order 90，MATCH 用 mkAfter 绝对置底
return {
    rules: [
        mkOrder(90, [
            rulesetRule("proxy", "国外代理"),
            rulesetRule("cn", "国内直连"),
        ]),
        mkAfter(["MATCH,漏网之鱼"]),
    ],
};
```

### 7.6 自定义规则集来源

使用 `makeRuleProvider` 支持任意 GitHub 仓库：

```js
const { makeRuleProvider, rulesetRule } = require('../lib/helpers');
const { mkOrder } = require('../lib/lazy');

const myRule = makeRuleProvider(
    "my-org", "my-rules", "main",
    "rules/custom.yaml"
);

return {
    rules: mkOrder(35, [rulesetRule(myRule.name, "我的组")]),
    'rule-providers': { [myRule.name]: myRule.provider },
};
```

### 7.7 链式代理（dialer-proxy）

通过 Clash 的 `dialer-proxy` 字段实现代理链：

```js
'proxy-groups': mkOrder(3, [{
    ...GROUP_COMMON,
    name: "我的链式代理",
    type: "url-test",
    proxies: ctx.config.proxies.map(p => p.name),
    filter: "(?i)特殊节点",
    "dialer-proxy": "手动选择",
}]),
```

---

## 附录：Nix 到 JavaScript 的适配

### 问题

Nix 的惰性求值让 `fix(self => { a = 1; b = self.a + 2; })` 自然工作。
JavaScript 急切求值，需要显式标记惰性边界。

### 解决方案

两阶段求值 + `deferred()` 标记：

1. **Phase 1**：按注册顺序依次执行模块，`prev` 即时可用，`final` Proxy 拦截访问报错
2. **Phase 2**：合并完成后，`final` Proxy 指向完整结果，解析所有 `deferred()` 值，展平有序列表

### 对比

| | Nix | JavaScript (本系统) |
|---|---|---|
| 惰性 | 隐式，每个属性独立惰性 | 显式，需用 `deferred()` 标记 |
| 访问 `final` | 任何位置 | 仅在 `deferred()` 内 |
| 访问 `prev` | 任何位置 | 任何位置 |
| 合并策略 | `//` 浅合并 | `clashModuleMerge` 智能合并 + 冲突检测 |
| 优先级 | `mkDefault` / `mkForce` | `mkDefault` / `mkForce` / `mkOverride` |
| 列表排序 | 无（所有 overlay 平等） | `mkBefore` / `mkOrder` / `mkAfter` |
