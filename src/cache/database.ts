import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import * as path from 'path'
import * as fs from 'fs'
import { DB_NAME } from '../constants'
import type { SymbolInfo } from './symbolIndex'

export class SymbolDatabase {
  /** @internal visible for testing */
  db: SqlJsDatabase | null = null
  private dbPath: string
  private wasmPath: string | undefined
  private builtinDbPath: string | undefined
  private initialized = false

  constructor(storagePath: string, wasmPath?: string, extensionPath?: string) {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }
    this.dbPath = path.join(storagePath, DB_NAME)
    this.wasmPath = wasmPath
    if (extensionPath) {
      this.builtinDbPath = path.join(extensionPath, 'static', DB_NAME)
    }
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.dbPath) && this.builtinDbPath && fs.existsSync(this.builtinDbPath)) {
      fs.copyFileSync(this.builtinDbPath, this.dbPath)
    }

    const initConfig: any = {}
    if (this.wasmPath) {
      const wasmBinary = fs.readFileSync(this.wasmPath)
      initConfig.wasmBinary = wasmBinary
    }

    const SQL = await initSqlJs(initConfig)

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    }
    else {
      this.db = new SQL.Database()
    }

    this.createTables()
    this.initialized = true
  }

  private createTables(): void {
    if (!this.db) return

    this.db.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        header TEXT NOT NULL,
        full_path TEXT,
        type TEXT,
        chip_target TEXT,
        idf_version TEXT,
        line_number INTEGER,
        description TEXT,
        UNIQUE(name, chip_target, idf_version)
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS headers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        full_path TEXT,
        includes TEXT,
        symbols TEXT
      )
    `)

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbol_name ON symbols(name)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbol_chip ON symbols(chip_target)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbol_header ON symbols(header)`)
  }

  async rebuild(idfPath: string, chipTarget: string): Promise<void> {
    const { spawn } = await import('child_process')
    const scriptPath = path.join(__dirname, '../../scripts/build_index.py')

    return new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [
        scriptPath,
        '--idf-path', idfPath,
        '--chip-target', chipTarget,
        '--output', this.dbPath,
      ])

      proc.stdout.on('data', (data: Buffer) => {
        console.log(`Index build: ${data.toString()}`)
      })

      proc.stderr.on('data', (data: Buffer) => {
        console.error(`Index build error: ${data.toString()}`)
      })

      proc.on('close', (code: number) => {
        if (code === 0) {
          this.reloadDatabase().then(resolve).catch(reject)
        }
        else {
          reject(new Error(`Index build failed with exit code: ${code}`))
        }
      })
    })
  }

  private async reloadDatabase(): Promise<void> {
    this.close()

    const initConfig: any = {}
    if (this.wasmPath) {
      const wasmBinary = fs.readFileSync(this.wasmPath)
      initConfig.wasmBinary = wasmBinary
    }

    const SQL = await initSqlJs(initConfig)
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    }
  }

  findSymbol(name: string, chipTarget: string = 'esp32'): SymbolInfo | null {
    if (!this.db) return null

    const result = this.db.exec(
      `SELECT * FROM symbols WHERE name = ? AND chip_target = ? ORDER BY idf_version DESC LIMIT 1`,
      [name, chipTarget],
    )

    if (!result.length || !result[0].values.length) return null

    const row = result[0]
    const colNames = row.columns
    const values = row.values[0]
    const obj: Record<string, any> = {}
    colNames.forEach((col, i) => { obj[col] = values[i] })

    return {
      name: obj.name,
      header: obj.header,
      fullPath: obj.full_path,
      type: obj.type,
      chipTarget: obj.chip_target,
      idfVersion: obj.idf_version,
      lineNumber: obj.line_number,
      description: obj.description ?? undefined,
    }
  }

  findAlternatives(name: string, chipTarget: string = 'esp32', limit: number = 5): SymbolInfo[] {
    if (!this.db) return []

    const result = this.db.exec(
      `SELECT * FROM symbols WHERE name = ? AND chip_target != ? ORDER BY idf_version DESC LIMIT ?`,
      [name, chipTarget, limit],
    )

    if (!result.length) return []

    const colNames = result[0].columns
    return result[0].values.map((values) => {
      const obj: Record<string, any> = {}
      colNames.forEach((col, i) => { obj[col] = values[i] })
      return {
        name: obj.name,
        header: obj.header,
        fullPath: obj.full_path,
        type: obj.type,
        chipTarget: obj.chip_target,
        idfVersion: obj.idf_version,
        lineNumber: obj.line_number,
        description: obj.description ?? undefined,
      }
    })
  }

  fuzzySearch(query: string, limit: number = 10): SymbolInfo[] {
    if (!this.db) return []

    const escapedQuery = query.replace(/'/g, "''")
    const result = this.db.exec(
      `SELECT * FROM symbols WHERE name LIKE ? ORDER BY name LIMIT ?`,
      [`%${escapedQuery}%`, limit],
    )

    if (!result.length) return []

    const colNames = result[0].columns
    return result[0].values.map((values) => {
      const obj: Record<string, any> = {}
      colNames.forEach((col, i) => { obj[col] = values[i] })
      return {
        name: obj.name,
        header: obj.header,
        fullPath: obj.full_path,
        type: obj.type,
        chipTarget: obj.chip_target,
        idfVersion: obj.idf_version,
        lineNumber: obj.line_number,
        description: obj.description ?? undefined,
      }
    })
  }

  getSymbolCount(): number {
    if (!this.db) return 0

    const result = this.db.exec('SELECT COUNT(*) as count FROM symbols')
    if (!result.length || !result[0].values.length) return 0
    return result[0].values[0][0] as number
  }

  save(): void {
    if (!this.db) return
    const data = this.db.export()
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.dbPath, data)
  }

  close(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}