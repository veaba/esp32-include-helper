import { describe, expect, it } from 'vitest'
import { matchUndefinedSymbol, isCOrCppFile } from '../src/diagnostics/errorMatcher'

describe('errorMatcher', () => {
  describe('matchUndefinedSymbol', () => {
    it('matches "use of undeclared identifier"', () => {
      expect(matchUndefinedSymbol("use of undeclared identifier 'esp_wifi_init'")).toBe('esp_wifi_init')
    })

    it('matches "unknown type name"', () => {
      expect(matchUndefinedSymbol("unknown type name 'gpio_num_t'")).toBe('gpio_num_t')
    })

    it('matches "Unknown type name" (clangd capitalized)', () => {
      expect(matchUndefinedSymbol("Unknown type name 'esp_chip_info_t'")).toBe('esp_chip_info_t')
    })

    it('matches "Use of undeclared identifier" (clangd capitalized)', () => {
      expect(matchUndefinedSymbol("Use of undeclared identifier 'esp_wifi_init'")).toBe('esp_wifi_init')
    })

    it('matches "no type named"', () => {
      expect(matchUndefinedSymbol("no type named 'esp_err_t'")).toBe('esp_err_t')
    })

    it('matches "implicit declaration of function"', () => {
      expect(matchUndefinedSymbol("implicit declaration of function 'nvs_open'")).toBe('nvs_open')
    })

    it('matches "undeclared" pattern', () => {
      expect(matchUndefinedSymbol("'ESP_ERR_NOT_FOUND' undeclared")).toBe('ESP_ERR_NOT_FOUND')
    })

    it('matches "undefined identifier"', () => {
      expect(matchUndefinedSymbol("undefined identifier 'gpio_config'")).toBe('gpio_config')
    })

    it('returns null for non-matching messages', () => {
      expect(matchUndefinedSymbol('variable has incomplete type')).toBeNull()
      expect(matchUndefinedSymbol('expected ";" after expression')).toBeNull()
      expect(matchUndefinedSymbol('')).toBeNull()
    })
  })

  describe('isCOrCppFile', () => {
    it('returns true for c files', () => {
      expect(isCOrCppFile('c')).toBe(true)
    })

    it('returns true for cpp files', () => {
      expect(isCOrCppFile('cpp')).toBe(true)
    })

    it('returns false for other languages', () => {
      expect(isCOrCppFile('javascript')).toBe(false)
      expect(isCOrCppFile('typescript')).toBe(false)
      expect(isCOrCppFile('python')).toBe(false)
    })
  })
})