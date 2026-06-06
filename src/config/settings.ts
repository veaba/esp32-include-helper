import { defineConfigObject } from 'reactive-vscode'
import * as Meta from '../generated/meta'

const scope = 'espIdfIncludeAssistant'

export const config = defineConfigObject<Meta.NestedConfigs[typeof scope]>(
  scope,
  Meta.configs.espIdfIncludeAssistantIdfPath.default as any,
) as any

export function getIdfPath(): string {
  return config.idfPath ?? ''
}

export function getChipTarget(): string {
  return config.chipTarget ?? 'esp32'
}

export function getIdfVersion(): string {
  return config.idfVersion ?? 'v5.5.4'
}

export function isQuickFixEnabled(): boolean {
  return config.enableQuickFix ?? true
}

export function isAutoDetectChip(): boolean {
  return config.autoDetectChip ?? true
}