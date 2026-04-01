import createClient from 'openapi-fetch'
import type { paths as TemplatePaths } from '../generated/template.ts'
import type { paths as DatabasePaths } from '../generated/database.ts'
import { getCurrentContext } from './config.ts'
import { ConfigError } from './errors.ts'

function resolveHost (options?: { baseUrl?: string }): string {
  const context = getCurrentContext()
  const host = options?.baseUrl || context?.host
  if (!host) {
    throw new ConfigError('No Sealos Cloud host configured. Run "sealos login <host>" first.')
  }
  return host
}

function resolveDatabaseHost (options?: { baseUrl?: string }): string {
  const override = process.env.SEALOS_DATABASE_HOST?.trim()
  if (override) {
    return override.replace(/\/+$/, '')
  }

  const host = resolveHost(options)
  const url = new URL(host)

  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.startsWith('dbprovider.')
  ) {
    return url.toString().replace(/\/+$/, '')
  }

  url.hostname = `dbprovider.${url.hostname}`
  return url.toString().replace(/\/+$/, '')
}

export function createTemplateClient (options?: { baseUrl?: string }) {
  return createClient<TemplatePaths>({ baseUrl: `${resolveHost(options)}/api/v2alpha` })
}

export function createDatabaseClient (options?: { baseUrl?: string }) {
  return createClient<DatabasePaths>({ baseUrl: `${resolveDatabaseHost(options)}/api/v2alpha` })
}
