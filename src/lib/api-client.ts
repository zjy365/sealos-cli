import createClient from 'openapi-fetch'
import type { paths as TemplatePaths } from '../generated/template.ts'
import type { paths as DatabasePaths } from '../generated/database.ts'
import type { paths as DevboxPaths } from '../generated/devbox.ts'
import { DEFAULT_SEALOS_REGION, loadAuth } from './auth.ts'
import { ConfigError } from './errors.ts'
import { normalizeSealosUrl } from './hosts.ts'

function resolveHost (options?: { baseUrl?: string }): string {
  let authRegion: string | undefined
  try {
    authRegion = loadAuth().region
  } catch {
    authRegion = undefined
  }

  const host = options?.baseUrl || process.env.SEALOS_REGION || authRegion || DEFAULT_SEALOS_REGION
  if (!host) {
    throw new ConfigError('No Sealos Cloud host configured. Run "sealos-cli login <host>" first.')
  }
  return normalizeSealosUrl(host, 'Sealos host')
}

export function resolveDbproviderHost (host: string): string {
  return resolvePrefixedHost(host, 'dbprovider')
}

export function resolveTemplateProviderHost (host: string): string {
  return resolvePrefixedHost(host, 'template')
}

export function resolveDevboxProviderHost (host: string): string {
  return resolvePrefixedHost(host, 'devbox')
}

function resolvePrefixedHost (host: string, prefix: string): string {
  const url = new URL(normalizeSealosUrl(host, `${prefix} provider host`))

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
    return normalizeSealosUrl(override, 'SEALOS_DATABASE_HOST')
  }

  return resolveDbproviderHost(resolveHost(options))
}

function resolveTemplateHost (options?: { baseUrl?: string }): string {
  return resolveTemplateProviderHost(resolveHost(options))
}

function resolveDevboxHost (options?: { baseUrl?: string }): string {
  const override = process.env.SEALOS_DEVBOX_HOST?.trim()
  if (override) {
    return normalizeSealosUrl(override, 'SEALOS_DEVBOX_HOST')
  }

  return resolveDevboxProviderHost(resolveHost(options))
}

export function createTemplateClient (options?: { baseUrl?: string }) {
  return createClient<TemplatePaths>({ baseUrl: `${resolveTemplateHost(options)}/api/v2alpha` })
}

export function createDatabaseClient (options?: { baseUrl?: string }) {
  return createClient<DatabasePaths>({ baseUrl: `${resolveDatabaseHost(options)}/api/v2alpha` })
}

export function createDevboxClient (options?: { baseUrl?: string }) {
  return createClient<DevboxPaths>({ baseUrl: `${resolveDevboxHost(options)}/api/v2alpha` })
}
