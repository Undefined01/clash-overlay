# substore-overlay

Sub-Store 脚本包，包含 1 个 Clash 覆写入口和 2 个独立 proxy operator。

## 入口文件

源码入口位于 [src/entrypoints](./src/entrypoints)：

- `index.ts`：Clash/Mihomo `main(config)` 覆写入口（模块合并）
- `01_detect_entry_landing_geo.ts`：`operator(proxies, targetPlatform, context)`，检测前置/落地地理信息
- `02_rename_by_entry_landing.ts`：`operator(...)`，消费 01 的字段进行统一重命名

## 构建产物

```bash
pnpm --filter substore-overlay build
```

构建后输出：

- `dist/index.js`
- `dist/01_detect_entry_landing_geo.js`
- `dist/02_rename_by_entry_landing.js`

## 模块系统（index.ts）

`index.ts` 使用 `mergeModules` 合并 `src/modules/*` 返回的配置片段。

模块签名：

```ts
(config: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>
```

可通过 `config._ctx` 获取 Sub-Store 上下文（`arguments: Map<string,string>`、`rawArguments`、`options`、`runtime`）。

## 01/02 Processor

两个 processor 保持 Sub-Store 原生 operator 写法，但提供 TypeScript 类型约束：

- 01 内置可替换接口类：`LandingApiClient`、`SurgeApiClient`
- 02 仅做排序与命名，不改动检测逻辑

## 开发命令

```bash
pnpm --filter substore-overlay test
pnpm --filter substore-overlay typecheck
pnpm --filter substore-overlay build
```
