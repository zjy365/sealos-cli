import { describe, expect, test } from 'vitest'
import { resolveDbproviderHost, resolveDevboxProviderHost, resolveTemplateProviderHost } from '../src/lib/api-client.ts'

describe('api client host resolution', () => {
  test('adds template prefix for template service hosts', () => {
    expect(resolveTemplateProviderHost('https://hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
  })

  test('adds dbprovider prefix for database service hosts', () => {
    expect(resolveDbproviderHost('https://hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
  })

  test('adds devbox prefix for devbox service hosts', () => {
    expect(resolveDevboxProviderHost('https://hzh.sealos.run')).toBe('https://devbox.hzh.sealos.run')
  })

  test('preserves localhost and existing prefixed hosts', () => {
    expect(resolveTemplateProviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveTemplateProviderHost('https://template.hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
    expect(resolveDbproviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveDbproviderHost('https://dbprovider.hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
    expect(resolveDevboxProviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveDevboxProviderHost('https://devbox.hzh.sealos.run')).toBe('https://devbox.hzh.sealos.run')
  })
})
