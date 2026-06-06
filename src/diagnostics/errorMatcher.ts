import * as vscode from 'vscode'
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
  return ['c', 'cpp'].includes(languageId)
}

export function extractUndefinedSymbols(diagnostics: vscode.Diagnostic[]): MatchResult[] {
  const results: MatchResult[] = []
  for (const diagnostic of diagnostics) {
    const symbolName = matchUndefinedSymbol(diagnostic.message)
    if (symbolName) {
      results.push({
        symbolName,
        originalMessage: diagnostic.message,
      })
    }
  }
  return results
}