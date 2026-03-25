# libmodule

通用的配置合成库（overlay system），适用于任何需要"多个模块各自贡献配置片段，最终合并为一份完整配置"的场景。

API 参考文档可通过 `pnpm docs` 自动生成至 `docs/api/`。

---

## 目录

- [核心概念](#核心概念)
- [安装](#安装)
- [快速上手](#快速上手)
- [Overlay 系统](#overlay-系统)
  - [基本用法](#基本用法)
  - [prev 与 final](#prev-与-final)
  - [延迟求值 defer](#延迟求值-defer)
- [优先级系统](#优先级系统)
  - [为什么需要优先级](#为什么需要优先级)
  - [mkDefault / mkForce / mkOverride](#mkdefault--mkforce--mkoverride)
  - [优先级数值表](#优先级数值表)
  - [冲突规则](#冲突规则)
- [排序系统](#排序系统)
  - [mkBefore / mkAfter / mkOrder](#mkbefore--mkafter--mkorder)
  - [排序数值表](#排序数值表)
- [深合并 deepMerge](#深合并-deepmerge)
  - [合并策略](#合并策略)
  - [自定义 merge 函数](#自定义-merge-函数)
- [模块系统 evalModules](#模块系统-evalmodules)
- [其他工具函数](#其他工具函数)
- [完整 API 一览](#完整-api-一览)

---

## 核心概念

假设你在写一个应用的配置系统，有多个独立模块，每个模块需要贡献一部分配置：

```
模块A → { port: 8080, rules: ['rule1'] }
模块B → { mode: 'proxy', rules: ['rule2', 'rule3'] }
模块C → { port: 8080, rules: ['rule4'] }
```

你希望最终得到的合并结果是：

```js
{
  port: 8080,
  mode: 'proxy',
  rules: ['rule1', 'rule2', 'rule3', 'rule4']
}
```

这就是 libmodule 解决的问题。它提供了一套声明式的配置合成机制：

- **数组自动拼接**，并且可以控制元素顺序
- **对象自动深合并**
- **标量值冲突检测**——如果模块A说 `port: 8080`，模块B说 `port: 3000`，直接报错，而非静默覆盖
- **优先级**——当你确实需要覆盖某个值时，用 `mkForce` 显式声明

---

## 安装

```bash
# 作为 workspace 依赖
pnpm add libmodule

# 或在 package.json 中（monorepo 内）
"dependencies": {
  "libmodule": "workspace:*"
}
```

---

## 快速上手

```ts
import { applyOverlays, deepMerge, mkBefore, mkAfter } from 'libmodule';

// 定义三个 overlay（配置片段）
const base = () => ({
  port: 8080,
  rules: ['allow-local'],
});

const security = () => ({
  rules: mkBefore(['deny-all']),  // 排在最前面
});

const fallback = () => ({
  rules: mkAfter(['allow-rest']),  // 排在最后面
});

// 合并
const config = applyOverlays({}, [base, security, fallback], {
  merge: deepMerge,
});

console.log(config);
// {
//   port: 8080,
//   rules: ['deny-all', 'allow-local', 'allow-rest']
// }
```

---

## Overlay 系统

### 基本用法

`applyOverlays(base, overlays, options)` 是核心入口。它接收：

- `base`：初始状态（通常是 `{}`）
- `overlays`：一个 overlay 函数数组，每个函数返回一个配置片段
- `options.merge`：合并策略（常用的是 `deepMerge`）

```ts
import { applyOverlays } from 'libmodule';

const result = applyOverlays(
  { name: 'app' },
  [
    (final, prev) => ({ version: '1.0' }),
    (final, prev) => ({ debug: true }),
  ],
);
// { name: 'app', version: '1.0', debug: true }
```

每个 overlay 函数接收两个参数：

| 参数 | 含义 | 何时可用 |
|------|------|---------|
| `final` | 所有 overlay 合并后的**最终**状态 | 只能在 `defer()` 中访问 |
| `prev` | 当前 overlay 之前的**累积**状态 | 随时可以直接读取 |

### prev 与 final

`prev` 是已经合并的所有前序 overlay 的结果，可以直接读取：

```ts
const overlay = (final, prev) => ({
  greeting: `Hello from port ${prev.port}`,
});
```

`final` 是一个代理对象，代表所有 overlay 合并后的最终状态。**不能直接在 overlay 函数体中读取它**，因为此时其他 overlay 还没合并完。直接读取会抛出异常：

```ts
// ❌ 错误！overlay 执行期间不能直接读 final
const bad = (final, prev) => ({
  count: final.items.length,  // 💥 Error: Cannot eagerly access final.items
});
```

那 `final` 有什么用？答案是 `defer()`。

### 延迟求值 defer

`defer(fn)` 创建一个"延迟值"——它的求值被推迟到所有 overlay 合并完毕之后：

```ts
import { defer, applyOverlays, deepMerge } from 'libmodule';

const result = applyOverlays(
  {},
  [
    () => ({ items: ['a', 'b', 'c'] }),
    (final) => ({
      // 延迟到合并完毕后再求值
      summary: defer(() => `共 ${final.items.length} 项`),
    }),
  ],
  { merge: deepMerge },
);

console.log(result.summary); // '共 3 项'
```

**典型使用场景**：某个值依赖于其他模块贡献的数据。比如代理组的成员列表要包含"所有已注册的代理"，但注册动作分散在多个模块中。

```ts
// 模块 A 注册代理
const modA = () => ({ _proxies: ['HK', 'US'] });

// 模块 B 创建代理组，成员列表需要引用最终的 _proxies
const modB = (final) => ({
  groups: [{
    name: 'Select',
    proxies: defer(() => final._proxies),
  }],
});
```

---

## 优先级系统

### 为什么需要优先级

当两个模块对同一个标量字段赋了不同的值时，直接合并会产生歧义。"后者覆盖前者"是一种策略，但它的问题是：**合并结果依赖于模块注册顺序**，而模块的作者通常不知道（也不应该关心）自己被注册在第几位。

libmodule 的做法是：**同优先级、不同值 = 报错**。如果你确实需要覆盖，必须显式声明优先级。

### mkDefault / mkForce / mkOverride

```ts
import { mkDefault, mkForce, mkOverride } from 'libmodule';

// mkDefault(value) — 声明一个"默认值"（优先级 1000，最容易被覆盖）
const mod1 = () => ({ port: mkDefault(8080) });

// 裸值（不包装）— 隐含优先级 100
const mod2 = () => ({ port: 3000 });

// mkForce(value) — 强制值（优先级 50，很难被覆盖）
const mod3 = () => ({ port: mkForce(443) });

// mkOverride(priority, value) — 自定义优先级
const mod4 = () => ({ port: mkOverride(25, 9999) });
```

### 优先级数值表

| API | 优先级数值 | 含义 |
|-----|-----------|------|
| `mkOverride(1, v)` | 1 | 最高优先级（几乎不可覆盖） |
| `mkForce(v)` | 50 | 强制值 |
| 裸值 `v` | 100 | 普通值（默认） |
| `mkDefault(v)` | 1000 | 默认值（最容易被覆盖） |
| `mkOverride(n, v)` | n | 任意自定义优先级 |

**规则：数字越小，优先级越高。**

### 冲突规则

| 情况 | 结果 |
|------|------|
| 相同优先级 + 相同值 | 正常（幂等） |
| 相同优先级 + 不同值 | **报错**（`Scalar conflict`） |
| 不同优先级 | 数字更小的一方胜出 |

```ts
import { applyOverlays, deepMerge, mkDefault, mkForce } from 'libmodule';

// ✅ 同一个值，没有冲突
applyOverlays({}, [
  () => ({ port: 8080 }),
  () => ({ port: 8080 }),
], { merge: deepMerge });

// ❌ 不同值 + 相同优先级 → 报错
applyOverlays({}, [
  () => ({ port: 8080 }),
  () => ({ port: 3000 }),   // 💥 Scalar conflict for key "port"
], { merge: deepMerge });

// ✅ mkDefault 被裸值覆盖（1000 > 100）
applyOverlays({}, [
  () => ({ port: mkDefault(8080) }),
  () => ({ port: 3000 }),
], { merge: deepMerge });
// → { port: 3000 }

// ✅ mkForce 覆盖裸值（50 < 100）
applyOverlays({}, [
  () => ({ port: 3000 }),
  () => ({ port: mkForce(443) }),
], { merge: deepMerge });
// → { port: 443 }
```

---

## 排序系统

### mkBefore / mkAfter / mkOrder

对于数组类型的字段，你可以控制元素的排列顺序，而不必关心模块的注册顺序：

```ts
import { mkBefore, mkAfter, mkOrder } from 'libmodule';

const modA = () => ({
  rules: mkAfter(['MATCH,PROXY']),        // 放最后（排序值 1500）
});

const modB = () => ({
  rules: mkBefore(['DENY-ALL']),           // 放最前（排序值 500）
});

const modC = () => ({
  rules: mkOrder(800, ['DIRECT-LOCAL']),   // 自定义排序值
});

const modD = () => ({
  rules: ['ALLOW-DNS'],                    // 默认排序值（1000）
});
```

合并后，按排序值从小到大排列：

```
DENY-ALL          (500 — mkBefore)
DIRECT-LOCAL      (800 — mkOrder)
ALLOW-DNS         (1000 — 默认)
MATCH,PROXY       (1500 — mkAfter)
```

### 排序数值表

| API | 排序值 | 含义 |
|-----|--------|------|
| `mkBefore(items)` | 500 | 排在前面 |
| 裸数组 `items` | 1000 | 默认位置 |
| `mkAfter(items)` | 1500 | 排在后面 |
| `mkOrder(n, items)` | n | 任意自定义排序值 |

**规则：数字越小，排得越前。** 相同排序值的元素按注册顺序排列（稳定排序）。

---

## 深合并 deepMerge

`deepMerge` 是当前公开的内置 merge 策略，适用于 `applyOverlays` 的 `merge` 选项。

### 合并策略

`deepMerge` 对不同类型的值采取不同的合并策略：

| 值类型 | 策略 | 例子 |
|--------|------|------|
| **数组** | 收集为有序段落，按排序值拼接 | `rules: ['a']` + `rules: ['b']` → `['a', 'b']` |
| **对象** | 递归深合并；内部的数组继续按相同规则合并 | `{a: {x:1}}` + `{a: {y:2}}` → `{a: {x:1, y:2}}` |
| **标量** | 后者覆盖前者 | `{ port: 7890 }` + `{ port: 1080 }` → `{ port: 1080 }` |
| **`defer`** | 包装递归合并，直到最终求值时解析 | 合并完毕后解析 |

### 自定义 merge 函数

如果默认行为不完全满足需求，可以直接传入自定义 `merge` 函数：

```ts
import { applyOverlays, scalarEqual, coreMerge } from 'libmodule';

const strictMerge = (current, extension) => {
  const result = { ...current };
  for (const [key, value] of Object.entries(extension)) {
    result[key] = key in result
      ? coreMerge(key, result[key], value, scalarEqual)
      : value;
  }
  return result;
};

const result = applyOverlays({}, overlays, { merge: strictMerge });
```

`applyOverlays` 自身会在最终阶段清理 `undefined` 值；`evalModules` 还会额外移除系统保留键（如 `_imports`、`_options`）。

---

## 模块系统 evalModules

`evalModules` 提供更接近 NixOS module 的使用方式：每个 module 的定义为 `({ config, ...args }) => Record<string, unknown>`，返回的配置片段会按 key 收集 definitions，经优先级过滤、类型合并和 `defer` 解析后得到最终结果。

模块可以返回一个特殊字段 `_imports`（module 列表），用于引入其它模块一并求值；该字段不会出现在最终结果中。

注意：与 `applyOverlays` 的 `final` 一样，module 执行阶段不能直接读取 `config`，需要用 `defer(() => config.xxx)` 延迟到合并完成后访问。

```ts
import { evalModules, defer } from 'libmodule';

const base = () => ({
  port: 7890,
  rules: ['a'],
});

const extra = () => ({
  rules: ['b'],
});

const root = ({ config }) => ({
  _imports: [extra],
  summary: defer(() => `rules: ${(config.rules as string[]).join(',')}`),
});

const final = evalModules({}, [base, root]);
console.log(final.summary); // 'rules: a,b'
```

需要 async 时使用 `evalModulesAsync`：module 可以是 `async` 函数，且 `defer` resolver 可以返回 `Promise`。

---

## 其他工具函数

### makeExtensible

让一个对象变得可"扩展"——返回一个带 `.extend()` 方法的对象：

```ts
import { makeExtensible } from 'libmodule';

const base = makeExtensible({ port: 8080 });
const extended = base.extend((final, prev) => ({
  port: prev.port + 1,
}));
console.log(extended.port); // 8081
```

### 辅助判断函数

| 函数 | 作用 |
|------|------|
| `isDefer(val)` | 判断是否为延迟值 |
| `isOverride(val)` | 判断是否为优先级包装值 |
| `isOrdered(val)` | 判断是否为排序包装值 |
| `isOrderedList(val)` | 判断是否为有序列表（合并中间态） |
| `isArrayLike(val)` | 判断是否为数组或排序包装值 |
| `getPriority(val)` | 获取值的优先级数值（裸值返回 100） |
| `unwrapPriority(val)` | 剥离优先级包装，返回原始值 |
| `forceDefer(val)` | 显式触发单个 defer 值 |
| `resolveDeferred(obj)` | 递归解析对象中的所有 defer 值 |

---

## 完整 API 一览

运行 `pnpm docs` 可生成详细的 API 参考文档。以下是导出的所有符号的速览：

### 类型

```ts
type MergeFn<TState = Record<string, unknown>> = (current: Partial<TState>, extension: Partial<TState>) => Partial<TState>
type OverlayFn<TState = Record<string, unknown>> = (final: TState, prev: Partial<TState>) => Partial<TState>
type ModuleArgs<TArgs, TConfig>
type ModuleFn<TArgs, TConfig> = (args: ModuleArgs<TArgs, TConfig>) => Record<string, unknown>
type AsyncModuleFn<TArgs, TConfig> = (args: ModuleArgs<TArgs, TConfig>) => Record<string, unknown> | Promise<Record<string, unknown>>

interface Override<T>       // 优先级包装
interface Ordered<T>        // 排序包装
interface OrderedList<T>    // 有序列表（合并中间态）
interface ApplyOverlaysOptions  // applyOverlays 选项
interface EvalModulesOptions    // evalModules 选项
```

### 常量

```ts
DEFAULT_PRIORITY    // 100 — 裸值的隐含优先级
MKDEFAULT_PRIORITY  // 1000
MKFORCE_PRIORITY    // 50

BEFORE_ORDER        // 500
DEFAULT_ORDER       // 1000
AFTER_ORDER         // 1500
```

### 函数

```ts
// Overlay 核心
applyOverlays(base, overlays, options?)
evalModules(base, modules, options?)
evalModulesAsync(base, modules, options?)
makeExtensible(base, overlays?)
extends_(overlay, baseFunc)
composeManyExtensions(overlays)

// 延迟求值
defer(fn)
isDefer(val)
forceDefer(val)
resolveDeferred(obj)
resolveDeferredAsync(obj)

// 优先级
mkOverride(priority, value)
mkDefault(value)
mkForce(value)
isOverride(val)
getPriority(val)
unwrapPriority(val)

// 排序
mkOrder(order, items)
mkBefore(items)
mkAfter(items)
isOrdered(val)
isOrderedList(val)
isArrayLike(val)

// merge helpers
deepMerge(current, extension)
coreMerge(key, current, extension, onScalar?)
coreDeepMerge(key, current, extension, onScalar?)

// 条件与多定义
mkIf(condition, value)
mkMerge(definitions)
```
