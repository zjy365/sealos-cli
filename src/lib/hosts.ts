import { ConfigError } from './errors.ts'

export function isLocalDevelopmentHost (hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  return normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
}

export function normalizeSealosUrl (value: string, label = 'Sealos host'): string {
  const raw = value.trim()
  if (!raw) {
    throw new ConfigError(`${label} is empty.`)
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`${label} must be a valid URL.`)
  }

  if (url.username || url.password) {
    throw new ConfigError(`${label} must not include username or password.`)
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalDevelopmentHost(url.hostname))) {
    throw new ConfigError(`${label} must use https:// except for localhost development hosts.`)
  }

  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
