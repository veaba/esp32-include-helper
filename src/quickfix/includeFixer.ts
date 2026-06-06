import * as vscode from 'vscode'
import { SymbolCache } from '../cache/symbolIndex'
import { matchUndefinedSymbol, isCOrCppFile } from '../diagnostics/errorMatcher'
import { isQuickFixEnabled } from '../config/settings'
import { logger } from '../utils'

export class IncludeQuickFixProvider implements vscode.CodeActionProvider {
  constructor(private cache: SymbolCache) {}

  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[]> {
    if (!isQuickFixEnabled()) {
      logger.info('QuickFix disabled by config')
      return []
    }

    if (!isCOrCppFile(document.languageId)) {
      logger.info(`QuickFix skipped: not C/C++ file, languageId=${document.languageId}`)
      return []
    }

    logger.info(`QuickFix invoked for ${document.uri.path}, diagnostics count: ${context.diagnostics.length}`)
    const actions: vscode.CodeAction[] = []

    for (const diagnostic of context.diagnostics) {
      logger.info(`  diagnostic: severity=${diagnostic.severity}, source=${diagnostic.source}, message="${diagnostic.message}"`)

      const symbolName = matchUndefinedSymbol(diagnostic.message)
      if (!symbolName) {
        logger.info(`  no symbol match for: "${diagnostic.message}"`)
        continue
      }

      logger.info(`  matched symbol: ${symbolName}`)

      const headerInfo = await this.cache.findSymbol(symbolName)
      if (!headerInfo) {
        logger.info(`  no header found in cache for symbol: ${symbolName}`)
        continue
      }

      logger.info(`  found header: ${headerInfo.header} for symbol: ${symbolName}`)

      if (this.isHeaderIncluded(document, headerInfo.header)) continue

      const insertPosition = this.getIncludeInsertPosition(document)

      const action = new vscode.CodeAction(
        `Add #include "${headerInfo.header}" (${symbolName})`,
        vscode.CodeActionKind.QuickFix,
      )
      action.diagnostics = [diagnostic]
      action.isPreferred = true
      action.edit = new vscode.WorkspaceEdit()
      action.edit.insert(document.uri, insertPosition, `#include "${headerInfo.header}"\n`)
      action.command = {
        command: 'esp-idf-include-assistant.onIncludeAdded',
        title: 'Record include action',
        arguments: [symbolName, headerInfo.header],
      }

      actions.push(action)

      const alternatives = await this.cache.findAlternatives(symbolName)
      for (const alt of alternatives.slice(0, 3)) {
        if (this.isHeaderIncluded(document, alt.header)) continue

        const altAction = new vscode.CodeAction(
          `Add #include "${alt.header}" (alternative)`,
          vscode.CodeActionKind.QuickFix,
        )
        altAction.diagnostics = [diagnostic]
        altAction.edit = new vscode.WorkspaceEdit()
        altAction.edit.insert(document.uri, insertPosition, `#include "${alt.header}"\n`)
        actions.push(altAction)
      }
    }

    logger.info(`QuickFix returning ${actions.length} actions`)
    return actions
  }

  private isHeaderIncluded(document: vscode.TextDocument, headerName: string): boolean {
    const text = document.getText()
    const pattern = new RegExp(`#include\\s+[<"]${this.escapeRegex(headerName)}[>"]`)
    return pattern.test(text)
  }

  private getIncludeInsertPosition(document: vscode.TextDocument): vscode.Position {
    const text = document.getText()
    const lines = text.split('\n')

    let lastIncludeLine = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#include')) {
        lastIncludeLine = i
      }
      else if (lastIncludeLine !== -1 && !lines[i].trim().startsWith('#') && lines[i].trim() !== '') {
        break
      }
    }

    if (lastIncludeLine !== -1) {
      return new vscode.Position(lastIncludeLine + 1, 0)
    }

    return new vscode.Position(0, 0)
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}