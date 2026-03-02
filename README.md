# clash-overlay

一个 `pnpm` workspace，包含两个包：

- `packages/libmodule`：通用模块/overlay 合成库
- `packages/substore-overlay`：Sub-Store / Clash 脚本集合

## 项目结构

```text
packages/
  libmodule/
  substore-overlay/
```

## 常用命令

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`pnpm build` 会构建 `substore-overlay` 并产出 4 个脚本：

- `packages/substore-overlay/dist/override.js`
- `packages/substore-overlay/dist/parse_node_name.js`
- `packages/substore-overlay/dist/detect_geo.js`
- `packages/substore-overlay/dist/rename_nodes.js`

## 包说明

- [libmodule](packages/libmodule/README.md)
- [substore-overlay](packages/substore-overlay/README.md)
