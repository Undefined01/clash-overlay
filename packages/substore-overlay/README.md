# substore-overlay

Sub-Store 脚本包，包含 1 个 Clash 覆写入口和 3 个独立 proxy operator。

## 入口文件

源码入口位于 [src/entrypoints](./src/entrypoints)：

- `override.ts`：Clash/Mihomo `main(config)` 覆写入口（模块合并）
- `parse_node_name.ts`：`operator(...)`，按节点名写入 `_nodeInfo`（countryCode/multiplier/tags）
- `detect_geo.ts`：`operator(...)`，检测入口/出口国家代码（写入 `_geoEntry` / `_geoLanding`）
- `rename_nodes.ts`：`operator(...)`，基于 `_geoEntry`（优先）或 `_nodeInfo` 做最终排序与命名

## 构建产物

```bash
pnpm --filter substore-overlay build
```

构建后输出：

- `dist/override.js`
- `dist/parse_node_name.js`
- `dist/detect_geo.js`
- `dist/rename_nodes.js`

## 模块系统（override.ts）

`override.ts` 使用 `mergeModules` 合并 `src/modules/*` 返回的配置片段。

模块签名：

```ts
(config: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>
```

可通过 `config._ctx` 获取 Sub-Store 上下文（`arguments: Map<string,string>`、`rawArguments`、`options`、`runtime`）。

## 00/01/02 Processor

三个 processor 保持 Sub-Store 原生 operator 写法，但提供 TypeScript 类型约束：

- 00 `parse_node_name` 负责按节点名解析并写入 `_nodeInfo`
- 01 `detect_geo` 写入 `_geoEntry` / `_geoLanding`
- 02 `rename_nodes` 基于 `_geoEntry`（优先）或 `_nodeInfo` 做最终排序与命名（命名来源不拼接 collection 名）

参数结构由各 entrypoint 文件头部的 `valibot` schema 定义：

- `parse_node_name`：无参数
- `detect_geo`：`cache` / `concurrency` / `entry_detection_mode`
- `rename_nodes`：无参数

## 开发命令

```bash
pnpm --filter substore-overlay test
pnpm --filter substore-overlay typecheck
pnpm --filter substore-overlay build
```
