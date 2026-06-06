import * as vscode from 'vscode'
import { SymbolDatabase } from './database'

export interface SymbolInfo {
  name: string
  header: string
  fullPath: string
  type: string
  chipTarget: string
  idfVersion: string
  lineNumber: number
  description?: string
}

export interface CacheStatus {
  symbolCount: number
  chipTarget: string
  idfVersion: string
}

export class SymbolCache {
  private db: SymbolDatabase

  constructor(storagePath: string, wasmPath?: string) {
    this.db = new SymbolDatabase(storagePath, wasmPath)
  }

  async initialize(): Promise<void> {
    return this.db.initialize()
  }

  async rebuild(idfPath: string, chipTarget: string): Promise<void> {
    return this.db.rebuild(idfPath, chipTarget)
  }

  async findSymbol(symbolName: string, chipTarget?: string): Promise<SymbolInfo | null> {
    const target = chipTarget ?? vscode.workspace.getConfiguration('espIdfIncludeAssistant').get<string>('chipTarget') ?? 'esp32'
    return this.db.findSymbol(symbolName, target)
  }

  async findAlternatives(symbolName: string, limit: number = 5): Promise<SymbolInfo[]> {
    const chipTarget = vscode.workspace.getConfiguration('espIdfIncludeAssistant').get<string>('chipTarget') ?? 'esp32'
    return this.db.findAlternatives(symbolName, chipTarget, limit)
  }

  async fuzzySearch(query: string, limit: number = 10): Promise<SymbolInfo[]> {
    return this.db.fuzzySearch(query, limit)
  }

  getStatus(): CacheStatus {
    return {
      symbolCount: this.db.getSymbolCount(),
      chipTarget: vscode.workspace.getConfiguration('espIdfIncludeAssistant').get<string>('chipTarget') ?? 'esp32',
      idfVersion: vscode.workspace.getConfiguration('espIdfIncludeAssistant').get<string>('idfVersion') ?? 'v5.5.4',
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }
}