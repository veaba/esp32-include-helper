export const EXTENSION_ID = "esp-idf-include-assistant";
export const EXTENSION_NAME = "ESP-IDF Include Helper";

export const CHIP_TARGETS = ["esp32", "esp32s3", "esp32c3", "esp32c6", "esp32h2"] as const;
export type ChipTarget = (typeof CHIP_TARGETS)[number];

export const DEFAULT_IDF_VERSION = "v5.5.4";
export const DEFAULT_CHIP_TARGET: ChipTarget = "esp32";

export const SYMBOL_TYPES = ["function", "macro", "typedef", "enum", "struct"] as const;
export type SymbolType = (typeof SYMBOL_TYPES)[number];

export const DIAGNOSTIC_PATTERNS = [
  /use of undeclared identifier '(\w+)'/i,
  /unknown type name '(\w+)'/i,
  /implicit declaration of function '(\w+)'/i,
  /'(\w+)' undeclared/i,
  /undefined identifier '(\w+)'/i,
  /no type named '(\w+)'/i,
] as const;

export const DB_NAME = "symbols.db";

export const CHIP_SPECIFIC_PATHS: Record<string, string[]> = {
  esp32: ["esp32/include", "hal/esp32/include", "soc/esp32/include"],
  esp32s3: ["esp32s3/include", "hal/esp32s3/include", "soc/esp32s3/include"],
  esp32c3: ["esp32c3/include", "hal/esp32c3/include", "soc/esp32c3/include"],
  esp32c6: ["esp32c6/include", "hal/esp32c6/include", "soc/esp32c6/include"],
  esp32h2: ["esp32h2/include", "hal/esp32h2/include", "soc/esp32h2/include"],
};
