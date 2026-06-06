import { describe, expect, it } from 'vitest'
import { CHIP_TARGETS, DEFAULT_CHIP_TARGET, DEFAULT_IDF_VERSION, DIAGNOSTIC_PATTERNS } from '../src/constants'

describe('constants', () => {
  it('has correct chip targets', () => {
    expect(CHIP_TARGETS).toContain('esp32')
    expect(CHIP_TARGETS).toContain('esp32s3')
    expect(CHIP_TARGETS).toContain('esp32c3')
    expect(CHIP_TARGETS).toContain('esp32c6')
    expect(CHIP_TARGETS).toContain('esp32h2')
  })

  it('has correct default chip target', () => {
    expect(DEFAULT_CHIP_TARGET).toBe('esp32')
  })

  it('has correct default IDF version', () => {
    expect(DEFAULT_IDF_VERSION).toBe('v5.5.4')
  })

  it('has diagnostic patterns that are regex', () => {
    for (const pattern of DIAGNOSTIC_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp)
    }
  })
})