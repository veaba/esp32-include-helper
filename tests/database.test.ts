import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { SymbolDatabase } from '../src/cache/database'

function findWasmPath(): string {
  const candidates = [
    path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.resolve(__dirname, '../static/sql-wasm.wasm'),
    path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.resolve(__dirname, '../../static/sql-wasm.wasm'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`sql-wasm.wasm not found, searched: ${candidates.join(', ')}`)
}

describe('SymbolDatabase', () => {
  let db: SymbolDatabase
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esp-idf-test-'))
    const wasmPath = findWasmPath()
    db = new SymbolDatabase(tmpDir, wasmPath)
    await db.initialize()
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initializes database with tables', () => {
    db.save()
    const dbPath = path.join(tmpDir, 'symbols.db')
    expect(fs.existsSync(dbPath)).toBe(true)
    expect(db.getSymbolCount()).toBe(0)
  })

  it('finds symbol by name and chip target', () => {
    db.db!.run(
      `INSERT INTO symbols (name, header, full_path, type, chip_target, idf_version, line_number) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['esp_wifi_init', 'esp_wifi.h', 'components/wifi/include/esp_wifi.h', 'function', 'esp32', 'v5.5.4', 42],
    )
    db.save()

    const result = db.findSymbol('esp_wifi_init', 'esp32')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('esp_wifi_init')
    expect(result!.header).toBe('esp_wifi.h')
  })

  it('returns null for unknown symbol', () => {
    const result = db.findSymbol('nonexistent_symbol', 'esp32')
    expect(result).toBeNull()
  })

  it('finds alternative symbols', () => {
    db.db!.run(
      `INSERT INTO symbols (name, header, full_path, type, chip_target, idf_version, line_number) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['esp_wifi_init', 'esp_wifi.h', 'components/wifi/include/esp_wifi.h', 'function', 'esp32s3', 'v5.5.4', 42],
    )
    db.save()

    const results = db.findAlternatives('esp_wifi_init', 'esp32')
    expect(results.length).toBe(1)
    expect(results[0].chipTarget).toBe('esp32s3')
  })

  it('gets symbol count', () => {
    db.db!.run(
      `INSERT INTO symbols (name, header, full_path, type, chip_target, idf_version, line_number) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['test_func', 'test.h', 'test/test.h', 'function', 'esp32', 'v5.5.4', 1],
    )
    db.save()

    expect(db.getSymbolCount()).toBe(1)
  })

  it('performs fuzzy search', () => {
    db.db!.run(
      `INSERT INTO symbols (name, header, full_path, type, chip_target, idf_version, line_number, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['esp_wifi_init', 'esp_wifi.h', 'components/wifi/include/esp_wifi.h', 'function', 'esp32', 'v5.5.4', 42, 'Initialize WiFi'],
    )
    db.save()

    const results = db.fuzzySearch('wifi', 10)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].name).toBe('esp_wifi_init')
  })
})