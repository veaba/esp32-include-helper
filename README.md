# ESP-IDF Include Helper

Smart detection of undefined symbols in C/C++ code and quick-add of corresponding ESP-IDF header files via VSCode Quick Fix.

## Features

- **Quick Fix (Lightbulb 💡)** — When clangd detects an undefined symbol like `esp_chip_info_t`, a lightbulb appears offering `Add #include "esp_chip_info.h"`
- **Symbol Cache** — Local SQLite database indexing 13,000+ symbols from ESP-IDF headers
- **Multi-chip Support** — Separate indexes for ESP32, ESP32-S3, ESP32-C3, ESP32-C6, ESP32-H2
- **Status Bar** — Shows cache status (symbol count) at a glance; yellow warning when cache is empty
- **First-run Guidance** — Prompts to set IDF path and rebuild cache on first activation

## Requirements

- [clangd](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd) VSCode extension (provides diagnostics that trigger Quick Fix)
- ESP-IDF v5.x installed locally
- Python 3.x (for index building script)

## Quick Start

1. Install the extension
2. Set your ESP-IDF path in VSCode Settings:

   ```
   espIdfIncludeAssistant.idfPath → D:\programs-dev\Espressif\frameworks\esp-idf-v5.5.4
   ```

3. Run `Ctrl+Shift+P` → **ESP-IDF: Rebuild Symbol Cache**
4. Open a `.c` / `.cpp` file, use an undefined symbol — clangd marks it red → click the lightbulb → **Add #include**

## How It Works

```
clangd: "Unknown type name 'esp_chip_info_t'"
    ↓
errorMatcher.ts: extracts symbol "esp_chip_info_t"
    ↓
SymbolCache.findSymbol("esp_chip_info_t") → { header: "esp_chip_info.h", ... }
    ↓
Quick Fix: "Add #include "esp_chip_info.h" (esp_chip_info_t)"
```

## Configuration

| Key | Description | Type | Default |
|-----|-------------|------|---------|
| `espIdfIncludeAssistant.idfPath` | ESP-IDF installation path | `string` | `""` |
| `espIdfIncludeAssistant.chipTarget` | Target chip type (`esp32`, `esp32s3`, `esp32c3`, `esp32c6`, `esp32h2`) | `string` | `"esp32"` |
| `espIdfIncludeAssistant.idfVersion` | ESP-IDF version | `string` | `"v5.5.4"` |
| `espIdfIncludeAssistant.enableQuickFix` | Enable Quick Fix feature | `boolean` | `true` |
| `espIdfIncludeAssistant.autoDetectChip` | Auto detect chip type from project config | `boolean` | `true` |

## Commands

| Command | Title |
|---------|-------|
| `esp-idf-include-assistant.rebuildCache` | ESP-IDF: Rebuild Symbol Cache |
| `esp-idf-include-assistant.showCacheStatus` | ESP-IDF: Show Cache Status |

## Manual Index Build

```bash
python scripts/build_index.py \
  --idf-path "D:/programs-dev/Espressif/frameworks/esp-idf-v5.5.4" \
  --chip-target esp32 \
  --idf-version v5.5.4 \
  --output ~/.esp-idf-include-assistant/symbols.db
```

You can also scan headers without building an index:

```bash
python scripts/scan_headers.py \
  --idf-path "D:/programs-dev/Espressif/frameworks/esp-idf-v5.5.4" \
  --chip-target esp32 \
  --filter wifi
```

## Project Structure

```
src/
  extension.ts          # Plugin entry — status bar, commands, Quick Fix registration
  cache/
    database.ts         # SQLite (sql.js WASM) database layer
    symbolIndex.ts      # SymbolCache facade
  diagnostics/
    errorMatcher.ts     # Regex patterns to extract undefined symbols from clangd
  quickfix/
    includeFixer.ts     # CodeActionProvider — generates "Add #include" fixes
  lsp/
    clangdClient.ts     # clangd LSP client (optional integration)
  config/
    settings.ts         # VSCode settings via reactive-vscode
  constants.ts          # Chip targets, diagnostic patterns, DB name
  utils.ts              # Logger
scripts/
  build_index.py        # Python script to build symbol index from ESP-IDF headers
  scan_headers.py        # Lightweight header scanner (no DB)
static/
  sql-wasm.wasm         # sql.js WASM binary
tests/
  constants.test.ts
  database.test.ts
  errorMatcher.test.ts
```

## Development

```bash
pnpm install          # Install dependencies
pnpm run dev          # Watch mode with sourcemaps
pnpm run build        # Production build
pnpm run test         # Run tests
pnpm run typecheck    # TypeScript type check
pnpm run lint         # ESLint
```

Press `F5` in VSCode to launch Extension Development Host.

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Plugin framework | VSCode Extension API + reactive-vscode | Reactive config, type-safe |
| LSP integration | vscode-languageclient → clangd | Leverages clangd diagnostics |
| Local cache | sql.js (WASM SQLite) | No native compilation, cross-platform |
| Index builder | Python + sqlite3 | Fast parsing of ESP-IDF headers |
| Build | tsdown | Fast bundling, CJS output |

## License

MIT
