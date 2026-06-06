import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { defineExtension } from "reactive-vscode";
import {
  languages,
  window,
  commands,
  ProgressLocation,
  CodeActionKind,
  StatusBarAlignment,
} from "vscode";
import { SymbolCache } from "./cache/symbolIndex";
import { IncludeQuickFixProvider } from "./quickfix/includeFixer";
import { ClangdLSPClient } from "./lsp/clangdClient";
import { config } from "./config/settings";
import { getIdfPath, getChipTarget } from "./config/settings";
import { matchUndefinedSymbol } from "./diagnostics/errorMatcher";
import { logger } from "./utils";

export const { activate, deactivate } = defineExtension(async (ctx: ExtensionContext) => {
  logger.info("ESP-IDF Include Helper activated");

  // ── 1. Status bar (persistent) ──
  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 50);
  statusBarItem.command = "esp-idf-include-assistant.showCacheStatus";
  ctx.subscriptions.push(statusBarItem);

  const updateStatusBar = (symbolCount: number) => {
    if (symbolCount === 0) {
      statusBarItem.text = "$(warning) ESP-IDF: no cache";
      statusBarItem.tooltip =
        'Symbol cache is empty. Click to rebuild or run "ESP-IDF: Rebuild Symbol Cache"';
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      statusBarItem.tooltip = `ESP-IDF Include Helper — ${symbolCount} symbols indexed. Click for details.`;
      statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
  };

  // ── 2. Initialize cache ──
  const wasmPath = path.join(ctx.extensionPath, "static", "sql-wasm.wasm");
  logger.info(`Loading WASM from: ${wasmPath}, exists: ${fs.existsSync(wasmPath)}`);
  const cache = new SymbolCache(ctx.globalStoragePath, wasmPath, ctx.extensionPath);
  await cache.initialize();

  const initialStatus = cache.getStatus();
  logger.info(`Cache initialized, status: ${JSON.stringify(initialStatus)}`);
  updateStatusBar(initialStatus.symbolCount);

  // ── 3. First-activate welcome (only if cache is empty & IDF path not set) ──
  const hasShownWelcome = ctx.globalState.get("hasShownWelcome");
  if (!hasShownWelcome && initialStatus.symbolCount === 0) {
    const idfPath = getIdfPath();
    if (!idfPath) {
      const action = await window.showWarningMessage(
        "ESP-IDF Include Helper: Symbol cache is empty. Set your ESP-IDF path and rebuild the cache to enable Quick Fix.",
        "Set IDF Path",
        "Rebuild Cache",
        "Dismiss",
      );
      if (action === "Set IDF Path") {
        await commands.executeCommand(
          "workbench.action.openSettings",
          "espIdfIncludeAssistant.idfPath",
        );
      } else if (action === "Rebuild Cache") {
        await commands.executeCommand("esp-idf-include-assistant.rebuildCache");
      }
    } else {
      const action = await window.showInformationMessage(
        "ESP-IDF Include Helper: Symbol cache is empty. Rebuild it now?",
        "Rebuild Cache",
        "Later",
      );
      if (action === "Rebuild Cache") {
        await commands.executeCommand("esp-idf-include-assistant.rebuildCache");
      }
    }
    await ctx.globalState.update("hasShownWelcome", true);
  }

  // ── 4. Clangd detection ──
  const clangdExtension = vscode.extensions.getExtension("llvm-vs-code-extensions.vscode-clangd");
  if (!clangdExtension) {
    window.showWarningMessage(
      "ESP-IDF Include Helper: clangd extension is not installed. Quick Fix requires clangd to detect undefined symbols. Install it from the marketplace for the best experience.",
    );
  }

  // ── 5. LSP client ──
  const lspClient = new ClangdLSPClient(ctx);
  await lspClient.start().catch((err) => {
    logger.warn("clangd LSP client failed to start:", err);
  });

  // ── 6. Quick Fix provider ──
  const quickFixProvider = new IncludeQuickFixProvider(cache);
  ctx.subscriptions.push(
    languages.registerCodeActionsProvider(
      [
        { scheme: "file", language: "c" },
        { scheme: "file", language: "cpp" },
      ],
      quickFixProvider,
      { providedCodeActionKinds: [CodeActionKind.QuickFix] },
    ),
  );

  // ── 7. Diagnostic listener ──
  ctx.subscriptions.push(
    languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        const diagnostics = languages.getDiagnostics(uri);
        const undefinedSymbols = diagnostics.filter(
          (d) => matchUndefinedSymbol(d.message) !== null,
        );

        if (undefinedSymbols.length > 0) {
          if (initialStatus.symbolCount === 0) {
            window.setStatusBarMessage(
              '$(warning) ESP-IDF cache is empty — run "ESP-IDF: Rebuild Symbol Cache" first',
              5000,
            );
          }
        }
      }
    }),
  );

  // ── 8. Commands ──
  ctx.subscriptions.push(
    commands.registerCommand("esp-idf-include-assistant.rebuildCache", async () => {
      let idfPath = getIdfPath();
      if (!idfPath) {
        const input = await window.showInputBox({
          prompt: "Enter ESP-IDF installation path",
          placeHolder: "e.g. D:/Espressif/frameworks/esp-idf-v5.5.4",
          title: "ESP-IDF Path",
        });
        if (!input) {
          window.showWarningMessage("Rebuild cancelled: ESP-IDF path is required");
          return;
        }
        const cfg = vscode.workspace.getConfiguration("espIdfIncludeAssistant");
        await cfg.update("idfPath", input, vscode.ConfigurationTarget.Global);
        idfPath = input;
      }

      const chipTarget = getChipTarget();
      try {
        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: `Rebuilding ESP-IDF symbol cache (${chipTarget})...`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: "Scanning headers..." });
            await cache.rebuild(idfPath, chipTarget);
            progress.report({ increment: 100, message: "Done!" });
          },
        );
        const status = cache.getStatus();
        updateStatusBar(status.symbolCount);
        window.showInformationMessage(
          `Symbol cache rebuilt: ${status.symbolCount} symbols indexed for ${chipTarget}`,
        );
      } catch (err: any) {
        window.showErrorMessage(`Failed to rebuild cache: ${err.message}`);
      }
    }),
  );

  ctx.subscriptions.push(
    commands.registerCommand("esp-idf-include-assistant.showCacheStatus", () => {
      const status = cache.getStatus();
      const details = [
        `Symbols: ${status.symbolCount}`,
        `Chip: ${status.chipTarget}`,
        `IDF Version: ${status.idfVersion}`,
      ].join(" | ");

      if (status.symbolCount === 0) {
        window.showWarningMessage(
          `ESP-IDF cache is empty. Run "ESP-IDF: Rebuild Symbol Cache" to index headers.`,
        );
      } else {
        window.showInformationMessage(`ESP-IDF Include Helper — ${details}`);
      }
    }),
  );

  ctx.subscriptions.push(
    commands.registerCommand(
      "esp-idf-include-assistant.onIncludeAdded",
      (_symbolName: string, _header: string) => {
        // Placeholder for telemetry or future use
      },
    ),
  );

  return () => {
    lspClient.stop();
    cache.close();
  };
});
