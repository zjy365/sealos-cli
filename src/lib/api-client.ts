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
  return host.replace(/\/+$/, '')
}

export function resolveDbproviderHost (host: string): string {
  return resolvePrefixedHost(host, 'dbprovider')
}

export function resolveTemplateProviderHost (host: string): string {
  return resolvePrefixedHost(host, 'template')
}

function resolvePrefixedHost (host: string, prefix: string): string {
  const url = new URL(host)

  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.startsWith(`${prefix}.`)
  ) {
    return url.toString().replace(/\/+$/, '')
  }

  url.hostname = `${prefix}.${url.hostname}`
  return url.toString().replace(/\/+$/, '')
}

function resolveDatabaseHost (options?: { baseUrl?: string }): string {
  const override = process.env.SEALOS_DATABASE_HOST?.trim()
  if (override) {
    return override.replace(/\/+$/, '')
  }

  return resolveDbproviderHost(resolveHost(options))
}

function resolveTemplateHost (options?: { baseUrl?: string }): string {
  return resolveTemplateProviderHost(resolveHost(options))
}

export function createTemplateClient (options?: { baseUrl?: string }) {
  return createClient<TemplatePaths>({ baseUrl: `${resolveTemplateHost(options)}/api/v2alpha` })
}

export function createDatabaseClient (options?: { baseUrl?: string }) {
  return createClient<DatabasePaths>({ baseUrl: `${resolveDatabaseHost(options)}/api/v2alpha` })
}
