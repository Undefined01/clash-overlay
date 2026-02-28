# clash-overlay

基于 [liboverlay](../liboverlay/README.md) 框架的 Clash/Mihomo 覆写脚本。将 Clash 配置拆分为独立模块，每个模块贡献一个配置片段，由框架自动合并为最终的完整配置。

---

## 目录

- [工作原理](#工作原理)
- [构建与使用](#构建与使用)
- [模块系统](#模块系统)
  - [模块签名](#模块签名)
  - [模块注册](#模块注册)
  - [模块上下文 ctx](#模块上下文-ctx)
- [编写模块](#编写模块)
  - [最简模块：标量配置](#最简模块标量配置)
  - [添加分流规则](#添加分流规则)
  - [添加代理组](#添加代理组)
  - [使用 mkOrder 控制规则顺序](#使用-mkorder-控制规则顺序)
  - [使用 deferred 引用最终状态](#使用-deferred-引用最终状态)
  - [使用优先级覆盖已有配置](#使用优先级覆盖已有配置)
  - [完整模块示例：创建一个流量分流模块](#完整模块示例创建一个流量分流模块)
- [内置模块一览](#内置模块一览)
- [工具函数](#工具函数)
  - [Clash 辅助函数](#clash-辅助函数)
  - [通用辅助函数](#通用辅助函数)
- [配置参数](#配置参数)
- [合并策略](#合并策略)

---

## 工作原理

```
Clash 订阅配置（proxies 等）
        │
        ▼
  ┌──────────────────┐
  │   clash-overlay   │
  │                  │
  │  general 模块    │──┐
  │  dns 模块        │  │
  │  base-groups 模块│  │  每个模块贡献一个配置片段
  │  streaming 模块  │  ├─→ moduleMerge 合并
  │  domestic 模块   │  │        │
  │  proxy 模块      │──┘        ▼
  │  ...             │    最终 Clash 配置
  └──────────────────┘
```

1. Clash/Mihomo 调用覆写脚本，传入原始订阅配置（`config`）
2. 脚本解析运行参数（`$arguments`）
3. 按注册顺序执行所有模块，每个模块返回其贡献的配置片段
4. `moduleMerge` 合并所有片段——数组按排序值拼接，对象深合并，标量做冲突检测
5. 解析所有 `deferred` 值（如依赖最终代理列表的代理组成员）
6. 清理元数据（`_proxies`、`_allSelectables` 等），输出最终配置

---

## 构建与使用

```bash
# 构建
pnpm build    # → packages/clash-overlay/dist/override.js

# 测试
pnpm test
```

构建产物 `dist/override.js` 是一个自包含脚本（IIFE 格式），导出 `main(config)` 函数，可直接在 Clash/Mihomo 中作为覆写脚本使用。

---

## 模块系统

### 模块签名

每个模块是一个函数，接收三个参数：

```ts
function myModule(
    final: Record<string, unknown>,   // 最终状态代理（只能在 deferred 中使用）
    prev: Record<string, unknown>,    // 累积状态（可直接读取）
    ctx: ModuleContext,               // 运行上下文
): Record<string, unknown> {          // 返回配置片段
    return { /* ... */ };
}
```

| 参数 | 用途 |
|------|------|
| `final` | 所有模块合并后的最终状态。**不能直接读取**——用 `deferred(() => final.xxx)` |
| `prev` | 当前模块之前的累积状态。可以直接读取，如 `prev.rules` |
| `ctx` | 包含运行参数和原始 Clash 配置（订阅的代理列表等） |

### 模块注册

在 `src/index.ts` 中注册模块。顺序决定 `prev` 可见的内容，但**不影响列表元素的最终排序**（排序由 `mkOrder` 控制）：

```ts
const modules: ClashModule[] = [
    generalModule,       // 通用配置
    dnsModule,           // DNS
    baseGroupsModule,    // 基础代理组 (mkBefore)
    domesticModule,      // 国内直连 (mkOrder 800)
    streamingModule,     // 流媒体 (mkOrder 850)
    proxyModule,         // 国外代理 + 兜底 (mkOrder 1100 + mkAfter)
];
```

### 模块上下文 ctx

```ts
interface ModuleContext {
    args: {
        ipv6Enabled: boolean;
        dnsMode: string;
        // ... 可通过 parseArgs 扩展
    };
    config: {
        proxies: Array<{ name: string; [key: string]: unknown }>;
        // ... 原始 Clash 订阅配置
    };
}
```

- `ctx.args`：运行参数，由 Clash 的 `$arguments` 解析而来
- `ctx.config`：原始订阅配置，主要用于获取 `proxies`（订阅的代理节点列表）

---

## 编写模块

### 最简模块：标量配置

只设置一些标量字段，不涉及列表或代理组：

```ts
export default function generalModule(
    _final: Record<string, unknown>,
    _prev: Record<string, unknown>,
    ctx: ModuleContext,
): Record<string, unknown> {
    return {
        'mixed-port': 7890,
        'allow-lan': true,
        mode: 'rule',
        ipv6: (ctx.args as { ipv6Enabled: boolean }).ipv6Enabled,
    };
}
```

标量配置的合并规则：
- 两个模块设置相同值 → OK（幂等）
- 两个模块设置不同值 → **报错**（需要用优先级解决）

### 添加分流规则

分流规则是数组，多个模块的规则会自动拼接。使用 `mkOrder` 控制在最终列表中的位置：

```ts
import { mkOrder } from 'liboverlay';
import { dustinRule, rulesetRule } from '../lib/clash.js';

export default function domesticModule(): Record<string, unknown> {
    const cn = dustinRule('cn');        // 创建一个规则提供者
    const cnIp = dustinRule('cnip');

    return {
        // 规则本身
        rules: mkOrder(800, [
            rulesetRule(cn.name, 'DIRECT'),
            rulesetRule(cnIp.name, 'DIRECT', 'no-resolve'),
        ]),

        // 规则提供者声明
        'rule-providers': {
            [cn.name]: cn.provider,
            [cnIp.name]: cnIp.provider,
        },
    };
}
```

**关键点**：

- `dustinRule('cn')` 创建一个指向 DustinWin 规则集的 rule-provider
- `rulesetRule(name, group, ...options)` 生成 `RULE-SET,name,group` 字符串
- `mkOrder(800, [...])` 让这些规则排在 800 的位置
- `rule-providers` 会自动合并（但同名 key 会报错，防止冲突）

### 添加代理组

代理组也是数组，用 `trafficGroup` 辅助函数创建，用排序控制位置：

```ts
import { mkOrder } from 'liboverlay';
import { trafficGroup, qureIcon } from '../lib/clash.js';

export default function streamingModule(
    final: Record<string, unknown>,
): Record<string, unknown> {
    return {
        'proxy-groups': mkOrder(850, [
            trafficGroup(final, '流媒体', {
                defaultProxy: '手动选择',
                icon: qureIcon('Netflix'),
            }),
        ]),

        rules: mkOrder(850, [
            'RULE-SET,streaming,流媒体',
        ]),
    };
}
```

`trafficGroup(final, name, opts)` 创建一个代理组，其成员列表是 `deferred` 的——它会在合并完毕后自动填充 `final._allSelectables`。

### 使用 mkOrder 控制规则顺序

分流规则的顺序决定了匹配优先级。内置模块使用以下排序值：

| 排序值 | 模块 | 含义 |
|--------|------|------|
| 500 | `mkBefore` | 基础代理组 |
| 600 | landing-proxy | 落地代理 |
| 650 | custom | 自定义规则 |
| 675 | ssh | SSH |
| 700 | private | 私有网络 / 广告 |
| 750 | academic | 学术 |
| 800 | domestic | 国内直连 |
| 850 | streaming | 流媒体 |
| 875 | gaming | 游戏 |
| 900 | ai | 国外 AI |
| 1000 | （默认） | 未指定排序值的规则 |
| 1100 | proxy | 国外代理 |
| 1500 | `mkAfter` | 兜底规则（MATCH） |

你编写的新模块可以选择合适的排序值来插入。例如，在"国内直连"之前、"学术"之后：

```ts
rules: mkOrder(780, ['IP-CIDR,10.0.0.0/8,my-group']),
```

### 使用 deferred 引用最终状态

当你的值依赖于其他模块的贡献时，用 `deferred`：

```ts
import { deferred } from 'liboverlay';

export default function summaryModule(final): Record<string, unknown> {
    return {
        // 等所有模块合并后，才知道一共有多少个代理组
        _summary: deferred(() => ({
            totalGroups: (final['proxy-groups'] as unknown[]).length,
            totalRules: (final.rules as unknown[]).length,
        })),
    };
}
```

`trafficGroup` 和 `generalGroup` 内部已经使用了 `deferred`，你通常不需要直接使用它——除非有自定义的跨模块依赖。

### 使用优先级覆盖已有配置

如果你想覆盖另一个模块设置的标量值：

```ts
import { mkForce, mkDefault } from 'liboverlay';

// 场景：general 模块设置了 mode: 'rule'，你想强制改为 'global'
export default function overrideModule(): Record<string, unknown> {
    return {
        mode: mkForce('global'),  // 优先级 50，覆盖裸值（优先级 100）
    };
}
```

```ts
// 场景：你设置了一个默认值，但允许其他模块用裸值覆盖
export default function defaultsModule(): Record<string, unknown> {
    return {
        'mixed-port': mkDefault(7890),    // 优先级 1000，任何裸值都能覆盖
        'allow-lan': mkDefault(true),
    };
}
```

### 完整模块示例：创建一个流量分流模块

以下示例展示了一个完整的流量分流模块，包含代理组、规则提供者和分流规则：

```ts
// src/modules/gaming.ts — 游戏平台分流
import { mkOrder } from 'liboverlay';
import { dustinRule, rulesetRule, trafficGroup, miniIcon } from '../lib/clash.js';

export default function gamingModule(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    // 1. 声明规则提供者
    const gameCn = dustinRule('games-cn');
    const gameGlobal = dustinRule('game');

    // 2. 返回配置片段
    return {
        // 代理组（排序值 875 → 排在 streaming 之后）
        'proxy-groups': mkOrder(875, [
            trafficGroup(final, '游戏平台', {
                defaultProxy: '手动选择',
                icon: miniIcon('Game'),
            }),
        ]),

        // 分流规则（同一排序值 → 与代理组同层级）
        rules: mkOrder(875, [
            rulesetRule(gameCn.name, '国内直连'),
            rulesetRule(gameGlobal.name, '游戏平台'),
        ]),

        // 规则提供者（自动合并，同名报错）
        'rule-providers': {
            [gameCn.name]: gameCn.provider,
            [gameGlobal.name]: gameGlobal.provider,
        },
    };
}
```

编写完模块后，在 `src/index.ts` 中注册：

```ts
import gamingModule from './modules/gaming.js';

const modules: ClashModule[] = [
    // ...
    gamingModule,
    // ...
];
```

---

## 内置模块一览

| 模块 | 文件 | 排序值 | 职责 |
|------|------|--------|------|
| general | `modules/general.ts` | — | 端口、TUN、sniffer、GEO 等基础标量配置 |
| dns | `modules/dns.ts` | — | DNS 服务器、fake-ip、hosts |
| base-groups | `modules/base-groups.ts` | `mkBefore` (500) | 手动选择、延迟测试、负载均衡等基础代理组 |
| landing-proxy | `modules/landing-proxy.ts` | 600 | 落地代理节点 |
| custom | `modules/custom.ts` | 650 | 自定义规则（校园网等） |
| ssh | `modules/ssh.ts` | 675 | SSH 端口分流 |
| private | `modules/private.ts` | 700 | 私有网络 + 广告拦截 |
| academic | `modules/academic.ts` | 750 | 学术网站 + Trackers |
| domestic | `modules/domestic.ts` | 800 | 国内直连 |
| streaming | `modules/streaming.ts` | 850 | 流媒体（Netflix 等） |
| gaming | `modules/gaming.ts` | 875 | 游戏平台 |
| ai | `modules/ai.ts` | 900 | 国外 AI（ChatGPT 等） |
| proxy | `modules/proxy.ts` | 1100 + `mkAfter` | 国外代理 + 漏网之鱼兜底 |

---

## 工具函数

### Clash 辅助函数

来自 `src/lib/clash.ts`：

| 函数 | 说明 |
|------|------|
| `dustinRule(name)` | 创建 DustinWin 规则集的 rule-provider |
| `makeRuleProvider(owner, repo, branch, path, overrides?)` | 创建自定义 rule-provider（自动推断 format 和 behavior） |
| `rulesetRule(provider, group, ...opts)` | 生成 `RULE-SET,provider,group` 字符串 |
| `trafficGroup(final, name, opts)` | 创建流量代理组（成员列表自动 deferred） |
| `generalGroup(final, opts)` | 创建通用代理组 |
| `reorderProxies(proxies, defaultProxy)` | 将默认代理移到列表首位 |
| `getGithub(owner, repo, branch, path)` | 构造 jsdelivr CDN URL |
| `miniIcon(name)` / `qureIcon(name)` / `externalIcon(id)` | 代理组图标 URL |
| `GROUP_COMMON` | 代理组公共默认配置 |
| `PRIMITIVE_GROUPS` | `['DIRECT', 'REJECT']` |

### 通用辅助函数

来自 `src/lib/helpers.ts`：

| 函数 | 说明 |
|------|------|
| `parseArgs(raw)` | 解析运行参数（`$arguments`） |
| `parseBool(val, defaultVal?)` | 解析布尔值 |
| `parseNumber(val, defaultVal?)` | 解析数字 |
| `parseString(defaultVal)` | 创建字符串解析器 |
| `mergeList(...items)` | 合并参数为扁平数组，过滤 falsy |

---

## 配置参数

通过 Clash 的 `$arguments` 传递参数：

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ipv6Enabled` | `boolean` | `false` | 是否启用 IPv6 |
| `dnsMode` | `string` | `'fake-ip'` | DNS 模式：`fake-ip` 或 `redir-host` |

使用方式（Clash 订阅 URL）：

```
url?ipv6Enabled=true&dnsMode=redir-host
```

---

## 合并策略

clash-overlay 使用 `createModuleMerge({ uniqueKeyFields: ['rule-providers'] })` 创建合并函数。这意味着：

- **数组**（`rules`、`proxy-groups`）：按 `mkOrder` 的排序值拼接
- **对象**（`dns`、`tun`、`sniffer`）：递归深合并
- **`rule-providers`**：合并时检查子 key 唯一性——两个模块声明同名 provider 会报错
- **标量**（`port`、`mode`）：同值幂等，不同值需要优先级解决
- **`_` 前缀**（`_proxies`、`_allSelectables`）：元数据，后者覆盖，`cleanup` 时移除

这些策略都由 liboverlay 的 `moduleMerge` 提供，clash-overlay 只是添加了 `rule-providers` 的唯一性约束。详见 [liboverlay 文档](../liboverlay/README.md)。
