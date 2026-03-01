# override

一个基于 overlay 模型的模块化配置合成框架，以及基于此框架的 Clash/Mihomo 覆写脚本。

## 项目结构

```
override/
├── packages/
│   ├── liboverlay/        # 通用 overlay 库
│   └── substore-overlay/     # Clash/Mihomo 覆写脚本
├── docs/
│   └── api/               # 自动生成的 API 参考（typedoc）
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── typedoc.config.mjs
```

### [liboverlay](packages/liboverlay/README.md)

通用的配置合成库。提供了一套完整的 overlay 体系，包括：

- **Overlay 合并**：多个配置片段按需叠加，后注册的 overlay 可以引用前一层的结果（`prev`）或最终结果（`final`）
- **延迟求值**（`deferred`）：某些值需要等所有 overlay 合并完毕后才能确定
- **优先级系统**（`mkDefault` / `mkForce` / `mkOverride`）：数值优先级，数字越小越优先
- **排序系统**（`mkBefore` / `mkAfter` / `mkOrder`）：控制列表元素的排列顺序
- **模块合并引擎**（`moduleMerge`）：综合了以上所有能力的通用配置合并策略

→ 详细文档：[packages/liboverlay/README.md](packages/liboverlay/README.md)

### [substore-overlay](packages/substore-overlay/README.md)

基于 liboverlay 的 Clash/Mihomo 覆写脚本。将 Clash 配置拆分为独立模块（DNS、代理组、分流规则等），每个模块贡献一个配置片段，由框架合并为最终的完整配置。

→ 详细文档：[packages/substore-overlay/README.md](packages/substore-overlay/README.md)

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9

如果使用 Nix：

```bash
nix-shell   # 自动提供 Node.js + pnpm
```

### 安装依赖

```bash
pnpm install
```

### 运行测试

```bash
pnpm test          # 运行所有测试（200 个测试用例）
pnpm typecheck     # TypeScript 类型检查
```

### 构建

```bash
pnpm build         # 构建 substore-overlay → dist/override.js
```

构建产物 `packages/substore-overlay/dist/override.js` 是一个自包含的 IIFE 脚本，可直接用于 Clash/Mihomo 的覆写功能。

### 生成 API 文档

```bash
pnpm docs          # → docs/api/
```

## 设计思想

本项目的配置合成模型受 NixOS module system 启发。核心思想是：

1. **配置即函数**：每个模块不直接产出配置，而是返回一个配置片段（overlay）
2. **声明式合并**：框架负责将所有片段合并为最终配置，而非命令式地修改全局状态
3. **冲突即错误**：两个模块对同一个标量字段赋了不同的值？报错，而不是静默地后者覆盖前者
4. **优先级解冲突**：如果你确实需要覆盖某个值，使用 `mkForce` 或 `mkOverride(priority, value)` 显式声明优先级
5. **列表可排序**：分流规则的顺序很重要，用 `mkBefore` / `mkAfter` / `mkOrder` 控制，无需了解其他模块的注册顺序
6. **延迟引用**：某些值（如代理组的成员列表）需要等所有模块合并完才能确定，用 `deferred(() => final.xxx)` 延迟求值

## 许可证

MIT
