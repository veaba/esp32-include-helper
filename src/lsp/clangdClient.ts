import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node'

export interface HeaderInfo {
  header: string
  description?: string
}

export class ClangdLSPClient {
  private client: LanguageClient | null = null
  private context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  async start(): Promise<void> {
    const clangdPath = await this.findClangd()
    if (!clangdPath) {
      console.warn('clangd not found, LSP integration disabled')
      return
    }

    const serverOptions: ServerOptions = {
      command: clangdPath,
      args: ['--background-index'],
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { scheme: 'file', language: 'c' },
        { scheme: 'file', language: 'cpp' },
      ],
      outputChannel: vscode.window.createOutputChannel('clangd'),
    }

    this.client = new LanguageClient(
      'clangd',
      'clangd',
      serverOptions,
      clientOptions,
    )

    await this.client.start()
    console.log('clangd LSP client started')
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop()
      this.client = null
    }
  }

  async getIncludeSuggestions(_symbolName: string): Promise<HeaderInfo[]> {
    if (!this.client || !this.client.isRunning()) {
      return []
    }

    return []
  }

  isRunning(): boolean {
    return this.client?.isRunning() ?? false
  }

  private async findClangd(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('espIdfIncludeAssistant')
    const configPath = config.get<string>('clangdPath')
    if (configPath) return configPath

    try {
      const result = await vscode.commands.executeCommand<string>('clangd.path')
      if (result) return result
    }
    catch {
      // clangd extension not available
    }

    return undefined
  }
}