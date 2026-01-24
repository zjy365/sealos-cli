import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import type { SealosConfig, Context } from '../types/index.ts'

const CONFIG_DIR = join(homedir(), '.sealos')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

/**
 * Ensure config directory exists
 */
export function ensureConfigDir (): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Read config file
 */
export function readConfig (): SealosConfig {
  ensureConfigDir()

  if (!existsSync(CONFIG_FILE)) {
    const defaultConfig: SealosConfig = {
      currentContext: '',
      contexts: []
    }
    return defaultConfig
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(content) as SealosConfig
  } catch (error) {
    throw new Error(`Failed to read config file: ${error}`)
  }
}

/**
 * Write config file
 */
export function writeConfig (config: SealosConfig): void {
  ensureConfigDir()

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    throw new Error(`Failed to write config file: ${error}`)
  }
}

/**
 * Get current context
 */
export function getCurrentContext (): Context | null {
  const config = readConfig()
  if (!config.currentContext) {
    return null
  }

  const context = config.contexts.find(ctx => ctx.name === config.currentContext)
  return context || null
}

/**
 * Set current context
 */
export function setCurrentContext (name: string): void {
  const config = readConfig()
  const context = config.contexts.find(ctx => ctx.name === name)

  if (!context) {
    throw new Error(`Context "${name}" not found`)
  }

  config.currentContext = name
  writeConfig(config)
}

/**
 * Add or update context
 */
export function upsertContext (context: Context): void {
  const config = readConfig()
  const existingIndex = config.contexts.findIndex(ctx => ctx.name === context.name)

  if (existingIndex >= 0) {
    config.contexts[existingIndex] = context
  } else {
    config.contexts.push(context)
  }

  // If this is the first context, set it as current automatically
  if (!config.currentContext) {
    config.currentContext = context.name
  }

  writeConfig(config)
}

/**
 * Remove context
 */
export function removeContext (name: string): void {
  const config = readConfig()
  config.contexts = config.contexts.filter(ctx => ctx.name !== name)

  // If removing current context, clear currentContext
  if (config.currentContext === name) {
    config.currentContext = config.contexts.length > 0 ? config.contexts[0].name : ''
  }

  writeConfig(config)
}

/**
 * Get config value
 */
export function getConfigValue (key: string): string | undefined {
  const config = readConfig()
  // TODO: Implement nested key access, e.g. "contexts.0.name"
  return (config as any)[key]
}

/**
 * Set config value
 */
export function setConfigValue (key: string, value: string): void {
  const config = readConfig()
  // TODO: Implement nested key setting
  (config as any)[key] = value
  writeConfig(config)
}
