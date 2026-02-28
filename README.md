# Clash Override

> 模块化的 Clash/Mihomo 覆写脚本，基于 Nix overlay 模型设计。

## 概述

将 Clash 覆写配置拆分为独立功能模块，每个模块负责一组相关功能（代理组、分流规则、DNS 等），最终通过 esbuild 打包为一个可供 Clash 直接调用的单文件 `override.js`。

### 核心设计

- **一个功能 = 一个模块文件**：流媒体、游戏、AI 等功能各占一个模块
- **Nix overlay 语义**：通过 `final` / `prev` / `deferred()` 实现模块间依赖和前向引用
- **有序列表**：通过 `mkBefore` / `mkAfter` / `mkOrder` 控制规则在最终配置中的位置
- **冲突检测**：标量值冲突自动报错，可通过 `mkDefault` / `mkOverride` 显式覆盖

## 快速开始

### 环境要求

- [Nix](https://nixos.org/download.html) 包管理器

### 安装与构建

```bash
# 进入开发环境
nix-shell

# 安装依赖
pnpm install

# 构建单文件输出
pnpm run build
# => dist/override.js

# 运行测试
pnpm test
```

或不进入 shell 直接运行：

```bash
nix-shell --run "pnpm install && pnpm run build"
```

### 使用方式

将 `dist/override.js` 配置到 Clash 客户端的 Override 功能中。该文件暴露一个全局 `main(config)` 函数，接收订阅配置并返回完整的 Clash 配置。

## 项目结构

```
├── src/
│   ├── index.js              # 入口：模块注册 + main 函数
│   ├── lib/
│   │   ├── lazy.js           # Nix-style overlay 核心（deferred, mkOrder 等）
│   │   ├── helpers.js        # 共享工具（规则集、代理组、图标等）
│   │   └── merge.js          # Clash 配置合并引擎
│   └── modules/
│       ├── general.js        # 通用配置（入站、TUN、嗅探、Geodata）
│       ├── dns.js            # DNS 配置（服务器、fake-ip、hosts）
│       ├── base-groups.js    # 基础代理组（手动选择、延迟测试、负载均衡、AI）
│       ├── landing-proxy.js  # 落地代理（链式代理固定出口 IP）
│       ├── custom.js         # 自定义规则（校园网、特殊 IP）
│       ├── ssh.js            # SSH 端口代理
│       ├── private.js        # 私有网络 + 广告拦截
│       ├── academic.js       # 学术网站 + 种子 Trackers
│       ├── domestic.js       # 国内直连
│       ├── streaming.js      # 流媒体（Netflix、YouTube 等）
│       ├── gaming.js         # 游戏平台
│       ├── ai.js             # 国外 AI 分流
│       └── proxy.js          # 国外代理 + 漏网之鱼兜底
├── tests/
│   ├── test-lazy.js          # overlay 系统单元测试
│   └── test-integration.js   # 完整覆写输出集成测试
├── scripts/
│   └── build.js              # esbuild 构建脚本
├── dist/
│   └── override.js           # 构建产物（单文件，供 Clash 使用）
├── package.json
├── shell.nix                 # Nix 开发环境
└── DESIGN.md                 # 详细设计文档
```

## 模块编写

每个模块是一个函数，签名为 `(final, prev, ctx) => contributions`：

```js
// src/modules/example.js
import { dustinRule, rulesetRule, trafficGroup, qureIcon } from '../lib/helpers.js';
import { mkOrder } from '../lib/lazy.js';

export default function exampleModule(final, prev, ctx) {
    const ruleset = dustinRule("example");

    return {
        // 代理组（mkOrder 控制在 proxy-groups 中的位置）
        'proxy-groups': mkOrder(50, [
            trafficGroup(final, "示例分流", {
                defaultProxy: "手动选择",
                icon: qureIcon("Example"),
            }),
        ]),

        // 分流规则
        rules: mkOrder(50, [
            rulesetRule(ruleset.name, "示例分流"),
        ]),

        // 规则集提供者
        'rule-providers': {
            [ruleset.name]: ruleset.provider,
        },
    };
}
```

### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `final` | Proxy | 所有模块合并后的最终状态（惰性，需用 `deferred()` 包裹访问） |
| `prev` | Object | 当前模块之前所有模块的累积状态（即时可用） |
| `ctx` | Object | 共享上下文：`ctx.args`（用户参数）、`ctx.config`（订阅配置） |

### 注册模块

在 `src/index.js` 中导入并添加到 `modules` 数组：

```js
import exampleModule from './modules/example.js';

const modules = [
    // ... 现有模块
    exampleModule,  // 添加到合适的位置
];
```

## 列表排序约定

| Order | 模块 | 说明 |
|-------|------|------|
| 0 | base-groups | 基础代理组（mkBefore） |
| 3 | landing-proxy | 落地代理 |
| 10 | custom | 自定义规则 |
| 15 | ssh | SSH 代理 |
| 20 | private | 私有网络 + 广告 |
| 30 | academic | 学术网站 + Trackers |
| 40 | domestic | 国内直连 |
| 50 | streaming | 流媒体 |
| 55 | gaming | 游戏平台 |
| 60 | ai | 国外 AI |
| 90 | proxy | 国外代理 |
| 10000 | proxy (mkAfter) | MATCH 兜底规则 |

## API 参考

### lib/lazy.js

| API | 说明 |
|-----|------|
| `deferred(fn)` | 标记延迟求值的值，`fn` 在所有模块合并后执行 |
| `mkBefore(items)` | 列表元素置顶（order = 0） |
| `mkAfter(items)` | 列表元素置底（order = 10000） |
| `mkOrder(n, items)` | 指定列表元素排序位置 |
| `mkDefault(value)` | 标记可被覆盖的默认值 |
| `mkOverride(value)` | 显式覆盖 `mkDefault` 值 |
| `mkForce(value)` | 断言值不可更改 |
| `applyOverlays(base, overlays, opts)` | 应用 overlay 并解析 deferred |

### lib/helpers.js

| API | 说明 |
|-----|------|
| `dustinRule(name)` | 创建 DustinWin 规则集 `{ name, provider }` |
| `makeRuleProvider(owner, repo, branch, path)` | 创建自定义规则集 |
| `rulesetRule(name, proxy, ...opts)` | 生成 `RULE-SET,name,proxy` 规则字符串 |
| `trafficGroup(final, name, opts)` | 创建流量代理组（proxies 自动 deferred） |
| `generalGroup(final, opts)` | 创建通用代理组 |
| `miniIcon(name)` / `qureIcon(name)` | 图标 URL 快捷函数 |
| `externalIcon(id)` | Icons8 图标 URL |
| `parseArgs(args)` | 解析 `$arguments` 参数 |

### lib/merge.js

| API | 说明 |
|-----|------|
| `mergeModules(modules, ctx)` | 合并所有模块为完整 Clash 配置 |
| `cleanup(config)` | 清理 `_*` 元数据键和空对象 |
| `clashModuleMerge(current, ext)` | Clash 配置合并策略 |

## 用户参数

通过 Clash 客户端的 `$arguments` 传递：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ipv6Enabled` | boolean | `false` | 启用 IPv6 |
| `dnsMode` | string | `"fake-ip"` | DNS 模式：`fake-ip` 或 `redir-host` |

## 技术栈

- **语言**: JavaScript (ES Modules)
- **构建**: [esbuild](https://esbuild.github.io/) — 打包为单文件 IIFE
- **包管理**: [pnpm](https://pnpm.io/)
- **环境管理**: [Nix](https://nixos.org/)
- **测试**: 原生 Node.js assert（无框架依赖）

## 参考

- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [DustinWin 规则集](https://github.com/DustinWin/ruleset_geodata)
- [DNS 配置参考](https://www.aloxaf.com/2025/04/how_to_use_geosite/)

## License

MIT
