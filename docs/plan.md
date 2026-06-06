# ESP-IDF Include Helper — Migration Plan

> 从 `es-syntax-badge` (ES6 语法标记插件) 迁移为 `esp-idf-include-assistant` (ESP-IDF 头文件智能补全插件)

## 1. 现状分析

### 当前项目 (`es-syntax-badge`)

| 项目 | 值 |
|------|------|
| 名称 | `es-syntax-badge` |
| 用途 | 在 JS/TS 文件中检测 ES6 方法并显示装饰标记 |
| 技术栈 | `reactive-vscode` + `tsdown` + `vscode-ext-gen` + `vitest` |
| 入口 | `src/index.ts` — 使用 `defineExtension` 注册装饰器 |
| 核心代码 | `src/es6/array.ts`, `src/es6/object.ts` — 硬编码 ES6 方法数据 |
| 配置 | `src/config.ts` — 使用 `defineConfigObject` (空配置) |
| 常量 | `src/constants.ts` — 仅定义 `Badge` 类型 |
| 工具 | `src/utils.ts` — 仅 logger |

**可复用的基础设施**：

- `reactive-vscode` 框架 + `tsdown` 构建 + `vscode-ext-gen` 元信息生成
- `eslint` / `vitest` 开发工具链
- `.vscode/launch.json` / `tasks.json` 调试配置（需微调）
- `LICENSE.md` (MIT)

**需要完全替换**：

- `src/index.ts` — 入口逻辑（从装饰器 → Quick Fix + LSP + 缓存）
- `src/es6/*` — ES6 方法数据（→ 删除）
- `src/constants.ts` — 常量（→ 重写为 ESP-IDF 相关常量）
- `src/config.ts` — 配置（→ 重写为 ESP-IDF 配置项）
- `src/utils.ts` — 工具（→ 重写）
- `package.json` — 所有字段（name, contributes, dependencies 等）

### 目标项目 (`esp-idf-include-assistant`) — 来自 design.md

| 组件 | 技术 |
|------|------|
| 插件框架 | VSCode Extension API |
| LSP 集成 | `vscode-languageclient` → 连接 clangd |
| 本地缓存 | SQLite3 (`better-sqlite3` 替代 `sqlite3`，无需 native 编译) |
| 索引构建 | Python 脚本 (`scripts/build_index.py`) |
| 配置管理 | VSCode Settings (idfPath, chipTarget, idfVersion 等) |
| 核心功能 | Quick Fix 提供器 — 检测未定义符号 → 查询缓存 → 自动添加 `#include` |

## 2. 目录结构变更

```
MIGRATION: 当前 → 目标

.vscode/
  launch.json           # 保留，微调 args
  tasks.json             # 保留，微调 build task
docs/
  design.md              # ✅ 已有，保留
  plan.md                # ✅ 本文件
scripts/                  # 🆕 新增
  build_index.py          # 索引构建脚本
  scan_headers.py          # 头文件扫描器 (design.md 中提及)
src/
  extension.ts            # 🆕 替换 index.ts，新入口
  lsp/
    clangdClient.ts        # 🆕 clangd LSP 客户端封装
  diagnostics/
    errorMatcher.ts       # 🆕 诊断信息匹配器
  quickfix/
    includeFixer.ts       # 🆕 Quick Fix 提供器
  cache/
    database.ts           # 🆕 SQLite 数据库操作
    symbolIndex.ts        # 🆕 符号索引查询
  config/
    settings.ts           # 🆕 配置管理
  generated/
    meta.ts               # ✏️ 重新生成 (vscode-ext-gen)
  constants.ts            # ✏️ 重写为 ESP-IDF 常量
  utils.ts                # ✏️ 重写为 ESP-IDF 工具
  es6/                    # ❌ 删除
  index.ts                # ❌ 删除 (被 extension.ts 取代)
  config.ts               # ✏️ 重写为新配置映射
tests/                    # ✏️ 重写测试
  extension.test.ts       # 🆕 插件入口测试
  quickfix.test.ts        # 🆕 Quick Fix 测试
  cache.test.ts           # 🆕 缓存测试
 icons/
  icon.png                # ✏️ 替换为 ESP-IDF 图标
  icon.svg                # ✏️ 替换
demos/                    # ❌ 删除 (ES6 相关)
static/                   # ❌ 删除 (ES6 截图)
```

## 3. 实施步骤

### Phase 1: 项目基础改造

#### 1.1 `package.json` 全面改写

```jsonc
{
  "name": "esp-idf-include-assistant",
  "displayName": "ESP-IDF Include Helper",
  "description": "智能检测未定义符号并快速添加对应的头文件",
  "version": "0.1.0",
  "publisher": "veaba",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Programming Languages", "Other"],
  "activationEvents": [
    "onLanguage:c",
    "onLanguage:cpp",
    "workspaceContains:**/CMakeLists.txt"
  ],
  "main": "./dist/index.js",
  "contributes": {
    "commands": [
      { "command": "esp-idf-include-assistant.rebuildCache", "title": "ESP-IDF: 重建符号缓存" },
      { "command": "esp-idf-include-assistant.showCacheStatus", "title": "ESP-IDF: 查看缓存状态" }
    ],
    "configuration": {
      "title": "ESP-IDF Include Helper",
      "properties": {
        "espIdfIncludeAssistant.idfPath": {
          "type": "string", "default": "", "description": "ESP-IDF 安装路径"
        },
        "espIdfIncludeAssistant.chipTarget": {
          "type": "string", "enum": ["esp32","esp32s3","esp32c3","esp32c6","esp32h2"],
          "default": "esp32", "description": "目标芯片类型"
        },
        "espIdfIncludeAssistant.idfVersion": {
          "type": "string", "default": "v5.5.4", "description": "ESP-IDF 版本"
        },
        "espIdfIncludeAssistant.enableQuickFix": {
          "type": "boolean", "default": true, "description": "启用快速修复功能"
        },
        "espIdfIncludeAssistant.autoDetectChip": {
          "type": "boolean", "default": true, "description": "从项目配置自动检测芯片类型"
        }
      }
    }
  },
  "extensionDependencies": ["llvm-vs-code-extensions.vscode-clangd"],
  "dependencies": {
    "vscode-languageclient": "^9.0.1",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^22.x",
    "typescript": "^5.7.3",
    "tsdown": "^0.13.3",
    "vitest": "^3.0.5",
    "@vscode/vsce": "^3.2.2",
    "eslint": "^9.20.1",
    "@antfu/eslint-config": "^4.2.1"
  }
}
```

> **关键决策**：使用 `better-sqlite3` 替代 `sqlite3`。
>
> - `better-sqlite3` 是同步 API，无需 promisify 回调，代码更简洁
> - 无 native addon 编译问题 (better-sqlite3 提供预编译二进制)
> - 设计文档中 `symbolIndex.ts` 基于 callback 风格的 `sqlite3` 写的，迁移时需改为同步 API

#### 1.2 删除旧代码

- 删除 `src/es6/` 目录
- 删除 `src/index.ts`
- 删除 `demos/` 目录
- 删除 `static/` 目录

#### 1.3 更新构建配置

`tsdown.config.ts` — 需添加 `better-sqlite3` 为 external（它是 native 模块）:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  format: ['cjs'],
  unbundle: false,
  exports: false,
  sourcemap: true,
  external: ['vscode', 'better-sqlite3'],
  outExtensions: () => ({ js: '.js' }),
})
```

### Phase 2: 核心模块实现

#### 2.1 `src/constants.ts` — ESP-IDF 常量

```ts
export const EXTENSION_ID = 'esp-idf-include-assistant'
export const EXTENSION_NAME = 'ESP-IDF Include Helper'

export const CHIP_TARGETS = ['esp32', 'esp32s3', 'esp32c3', 'esp32c6', 'esp32h2'] as const
export type ChipTarget = typeof CHIP_TARGETS[number]

export const DEFAULT_IDF_VERSION = 'v5.5.4'
export const DEFAULT_CHIP_TARGET: ChipTarget = 'esp32'

export const SYMBOL_TYPES = ['function', 'macro', 'typedef', 'enum', 'struct'] as const
export type SymbolType = typeof SYMBOL_TYPES[number]

export const DIAGNOSTIC_PATTERNS = [
  /use of undeclared identifier '(\w+)'/,
  /unknown type name '(\w+)'/,
  /implicit declaration of function '(\w+)'/,
  /'(\w+)' undeclared/,
  /undefined identifier '(\w+)'/,
] as const
```

#### 2.2 `src/config/settings.ts` — 配置管理

基于 `reactive-vscode` 的 `defineConfigObject`，保持项目风格一致：

```ts
import { defineConfigObject } from 'reactive-vscode'
import * as Meta from '../generated/meta'

export const config = defineConfigObject<Meta.ScopedConfigKeyTypeMap>(
  Meta.scopedConfigs.scope,
  Meta.scopedConfigs.defaults,
)

// 封装便捷 getter
export function getIdfPath(): string {
  return config.idfPath ?? ''
}
export function getChipTarget(): string {
  return config.chipTarget ?? 'esp32'
}
export function getIdfVersion(): string {
  return config.idfVersion ?? 'v5.5.4'
}
export function isQuickFixEnabled(): boolean {
  return config.enableQuickFix ?? true
}
export function isAutoDetectChip(): boolean {
  return config.autoDetectChip ?? true
}
```

#### 2.3 `src/cache/database.ts` — SQLite 数据库层

使用 `better-sqlite3` 同步 API，对应设计文档中 `symbolIndex.ts` 的数据库操作部分：

```ts
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

export class SymbolDatabase {
  private db: Database.Database | null = null
  private dbPath: string

  constructor(storagePath: string) {
    this.dbPath = path.join(storagePath, 'symbols.db')
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath)
    this.createTables()
  }

  private createTables(): void { /* 与 design.md 相同的 DDL */ }

  async rebuild(idfPath: string, chipTarget: string): Promise<void> { /* 调用 Python 脚本 */ }

  async findSymbol(name: string): Promise<SymbolInfo | null> { /* 同步查询 */ }
  async findAlternatives(name: string, limit?: number): Promise<SymbolInfo[]> { /* 同步查询 */ }
  async fuzzySearch(query: string, limit?: number): Promise<SymbolInfo[]> { /* FTS5 查询 */ }
  getStatus(): CacheStatus { /* 同步获取 */ }
  async close(): Promise<void> { this.db?.close(); this.db = null }
}
```

#### 2.4 `src/cache/symbolIndex.ts` — 符号索引（外观模式）

封装 `SymbolDatabase`，提供面向 Quick Fix 的简洁接口：

```ts
import { SymbolDatabase } from './database'

export class SymbolCache {
  private db: SymbolDatabase

  constructor(storagePath: string) {
    this.db = new SymbolDatabase(storagePath)
  }

  async initialize() { return this.db.initialize() }
  async rebuild(idfPath: string, chipTarget: string) { return this.db.rebuild(idfPath, chipTarget) }
  async findSymbol(name: string) { return this.db.findSymbol(name) }
  async findAlternatives(name: string, limit?: number) { return this.db.findAlternatives(name, limit) }
  getStatus() { return this.db.getStatus() }
  async close() { return this.db.close() }
}
```

#### 2.5 `src/diagnostics/errorMatcher.ts` — 诊断信息匹配器

提取自 `includeFixer.ts` 中的 `extractUndefinedSymbol`，独立为可测试模块：

```ts
import { DIAGNOSTIC_PATTERNS } from '../constants'

export interface MatchResult {
  symbolName: string
  originalMessage: string
}

export function matchUndefinedSymbol(message: string): string | null {
  for (const pattern of DIAGNOSTIC_PATTERNS) {
    const match = message.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function isCOrCppFile(languageId: string): boolean {
  return ['c', 'cpp', 'h', 'hpp'].includes(languageId)
}
```

#### 2.6 `src/quickfix/includeFixer.ts` — Quick Fix 提供器

与设计文档基本一致，但使用 `SymbolCache` 和 `errorMatcher`：

```ts
import * as vscode from 'vscode'
import { SymbolCache } from '../cache/symbolIndex'
import { matchUndefinedSymbol, isCOrCppFile } from '../diagnostics/errorMatcher'

export class IncludeQuickFixProvider implements vscode.CodeActionProvider {
  constructor(private cache: SymbolCache) {}

  async provideCodeActions(document, range, context, token) {
    // 核心逻辑与 design.md 相同
    // 1. 过滤 C/C++ 文件
    // 2. 从 diagnostics 中提取未定义符号
    // 3. 查询 SymbolCache 获取头文件
    // 4. 生成 CodeAction
  }
}
```

#### 2.7 `src/lsp/clangdClient.ts` — LSP 客户端封装

连接 clangd，监听其诊断输出。核心职责：

1. 启动 clangd 作为 LSP Server
2. 转发 clangd 诊断到 VSCode
3. 提供 `getIncludeSuggestions()` 方法作为 Quick Fix 的补充数据源

```ts
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'

export class ClangdLSPClient {
  private client: LanguageClient | null = null

  async start(): Promise<void> { /* 启动 clangd */ }
  async stop(): Promise<void> { /* 停止 clangd */ }
  async getIncludeSuggestions(symbolName: string): Promise<HeaderInfo[]> { /* 查询 clangd */ }
}
```

#### 2.8 `src/extension.ts` — 插件入口

整合所有模块，使用 `reactive-vscode` 的 `defineExtension`：

```ts
import * as vscode from 'vscode'
import { defineExtension } from 'reactive-vscode'
import { ClangdLSPClient } from './lsp/clangdClient'
import { IncludeQuickFixProvider } from './quickfix/includeFixer'
import { SymbolCache } from './cache/symbolIndex'
import { config } from './config/settings'

export const { activate, deactivate } = defineExtension(async (ctx) => {
  const cache = new SymbolCache(ctx.globalStoragePath)
  await cache.initialize()

  const lspClient = new ClangdLSPClient(ctx)
  await lspClient.start()

  const quickFixProvider = new IncludeQuickFixProvider(cache)
  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
      quickFixProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  )

  // 监听诊断变化
  ctx.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => { /* 状态栏提示 */ })
  )

  // 命令: 重建缓存
  ctx.subscriptions.push(
    vscode.commands.registerCommand('esp-idf-include-assistant.rebuildCache', async () => { /* ... */ })
  )

  // 命令: 查看缓存状态
  ctx.subscriptions.push(
    vscode.commands.registerCommand('esp-idf-include-assistant.showCacheStatus', () => { /* ... */ })
  )

  return () => {
    lspClient.stop()
    cache.close()
  }
})
```

### Phase 3: Python 索引构建脚本

#### 3.1 `scripts/build_index.py`

直接采用 design.md 中的代码，核心逻辑不变。微调：

- 添加 `--verbose` 参数用于调试
- 输出 JSON 进度文件供插件 UI 展示

#### 3.2 `scripts/scan_headers.py`

`build_index.py` 中已包含 `collect_headers()` 和 `parse_header()` 功能。如果需要更细粒度的头文件扫描（如仅扫描而不建索引），可独立提取为 `scan_headers.py`。

### Phase 4: 配置与元信息更新

#### 4.1 重新生成 `src/generated/meta.ts`

运行 `pnpm update` (即 `vscode-ext-gen`)，基于新的 `package.json` contributes 自动生成。

#### 4.2 `.vscode/launch.json`

更新 `runtimeArgs` 以包含 `--extensionDevelopmentPath` 和新的插件 ID。

#### 4.3 `.gitignore`

添加：

```
*.db
symbols.db
```

### Phase 5: 测试

#### 5.1 单元测试结构

```
tests/
  extension.test.ts     # 插件激活/停用
  quickfix.test.ts       # Quick Fix 提供器逻辑
  cache.test.ts          # SQLite 缓存查询
  diagnostics.test.ts    # 正则匹配未定义符号
  database.test.ts       # 数据库建表/插入/查询
```

#### 5.2 集成测试

- 创建模拟 `.db` 文件进行缓存查询测试
- 使用 VSCode Extension Test Harness 测试 CodeActionProvider

### Phase 6: 图标与文档

- 替换 `icons/` 下的图标为 ESP-IDF 相关图标
- 删除 `demos/` 和 `static/` (ES6 相关资源)
- 保留 `docs/design.md`
- `README.md` — 重写为 ESP-IDF Include Helper 说明

## 4. 关键技术决策

| # | 决策点 | 设计文档方案 | 迁移调整 | 理由 |
|---|-------|------------|---------|------|
| 1 | SQLite 绑定 | `sqlite3` (异步回调) | `sql.js` (WASM) | `better-sqlite3` 在开发环境原生编译失败，已切换到 `sql.js`；纯 WASM 无 native 依赖，跨平台兼容更佳 |
| 2 | 入口风格 | 原生 VSCode API `activate/deactivate` | `reactive-vscode` 的 `defineExtension` | 保留原项目框架风格，减少改造成本 |
| 3 | 配置管理 | 直接读 `vscode.workspace.getConfiguration()` | 复用 `reactive-vscode` 的 `defineConfigObject` | 响应式配置，类型安全 |
| 4 | 元信息生成 | 手写 `package.json` contributes | `vscode-ext-gen` 自动生成 `meta.ts` | 保持原项目工作流 |
| 5 | 构建 | `tsc` | `tsdown` | 保持原项目工具链 |
| 6 | LSP 集成 | `vscode-languageclient` | 同方案，版本 `^9.0.1` | 设计文档方案合理 |
| 7 | 入口文件名 | `extension.ts` | `extension.ts` (但导出 `index.ts` 供 `main` 字段引用) | 实际入口仍由 `main: "./dist/index.js"` 指向 `src/index.ts` 打包结果；`extension.ts` 只做逻辑，由 `index.ts` re-export |
| 8 | Python 脚本 | 放在 `scripts/` | 同方案，打包时需配置 `files` 白名单或运行时 `asAbsolutePath()` 定位 | 索引构建是离线 CLI 行为，不打包进 vsix |

## 5. 执行顺序与依赖关系

```
Phase 1 (基础改造)
  ├── 1.1 package.json 改写
  ├── 1.2 旧代码删除
  └── 1.3 tsdown.config.ts 更新
       │
Phase 2 (核心模块) ──── 依赖 Phase 1 完成
  ├── 2.1 constants.ts
  ├── 2.2 config/settings.ts
  ├── 2.3 cache/database.ts
  ├── 2.4 cache/symbolIndex.ts
  ├── 2.5 diagnostics/errorMatcher.ts
  ├── 2.6 quickfix/includeFixer.ts ─── 依赖 2.3, 2.5
  ├── 2.7 lsp/clangdClient.ts
  └── 2.8 extension.ts ──── 依赖 2.2~2.7 全部
       │
Phase 3 (Python 脚本) ──── 独立，可与 Phase 2 并行
  │
Phase 4 (配置更新) ──── 依赖 Phase 1 完成
  │
Phase 5 (测试) ──── 依赖 Phase 2 完成
  │
Phase 6 (图标/文档) ──── 独立，可随时执行
```

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `better-sqlite3` 在 VSCode 扩展中打包问题 | vsix 体积增大 / 跨平台兼容 | 使用 `vscode-ext-gen` 的 `files` 字段控制打包范围；考虑使用 `sql.js`（纯 JS WASM SQLite）作为备选 |
| clangd 未安装时插件行为 | Quick Fix 功能不可用 | 插件检测 clangd 是否存在，不存在时仅使用本地缓存模式，并提示安装 |
| ESP-IDF 路径配置缺失 | 缓存为空 | 首次启动时弹窗引导用户配置 IDF 路径 |
| Python 环境差异 | 索引构建脚本失败 | 提供 `requirements.txt`；考虑未来用 Node.js 重写索引构建脚本 |
| FTS5 可能未编译进系统 SQLite | 模糊搜索失败 | 降级为 `LIKE` 查询；或使用 `better-sqlite3` 自带的 FTS5 支持 |

## 7. 实施变更记录

### 已完成

- **SQLite 方案切换**：从 `better-sqlite3` 切换到 `sql.js`（WASM SQLite）
  - 原因：`better-sqlite3` 在开发环境（Windows + pnpm）原生编译失败
  - 影响：`database.ts` API 从同步改为异步 `initialize()` / 同步查询 / `save()` 持久化
  - 测试：19 项测试全部通过

- **全局变量修复**：`extension.ts` 中 `vscode.CodeActionKind` 改为从 vscode 导入的 `CodeActionKind`

- **vscode-ext-gen 自动再生**：`pnpm install` 触发 `vscode-ext-gen`，`meta.ts` 已基于新 `package.json` 自动更新
