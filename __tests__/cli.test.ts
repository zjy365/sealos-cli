import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { resolveDbproviderHost, resolveTemplateProviderHost } from '../src/lib/api-client.ts'
import {
  buildCatalogTemplateDeployBody,
  buildRawTemplateDeployBody,
  resolveTemplateDeployMode
} from '../src/commands/template/index.ts'

describe('template deploy validation', () => {
  test('rejects dry-run for catalog deploys', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        set: [],
        dryRun: true
      }, true)
    }).toThrow(/--dry-run is only supported for raw template deploys/)
  })

  test('rejects mixed catalog and raw inputs', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        file: './template.yaml',
        set: []
      }, true)
    }).toThrow(/Cannot specify both a template name and --file\/--yaml\/stdin/)
  })

  test('requires --name for catalog deploys', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        set: []
      }, true)
    }).toThrow(/--name is required when deploying from the template catalog/)
  })

  test('builds catalog deploy request body without dryRun', () => {
    expect(
      buildCatalogTemplateDeployBody('perplexica', {
        name: 'app',
        set: ['OPENAI_API_KEY=secret']
      })
    ).toEqual({
      name: 'app',
      template: 'perplexica',
      args: {
        OPENAI_API_KEY: 'secret'
      }
    })
  })

  test('builds raw deploy request body with dryRun', () => {
    expect(
      buildRawTemplateDeployBody('apiVersion: app.sealos.io/v1\nkind: Template', {
        set: ['OPENAI_API_KEY=secret'],
        dryRun: true
      })
    ).toEqual({
      yaml: 'apiVersion: app.sealos.io/v1\nkind: Template',
      args: {
        OPENAI_API_KEY: 'secret'
      },
      dryRun: true
    })
  })
})

describe('help output', () => {
  test('template deploy help documents raw-only dry-run', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'template', 'deploy', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Validate raw template YAML without creating resources/)
    expect(help).toMatch(/Catalog:/)
    expect(help).toMatch(/Raw:/)
  })

  test('login help documents token limited mode', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'login', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Store a regional token without OAuth device login/)
  })
})

describe('api client host resolution', () => {
  test('adds template prefix for template service hosts', () => {
    expect(resolveTemplateProviderHost('https://hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
  })

  test('adds dbprovider prefix for database service hosts', () => {
    expect(resolveDbproviderHost('https://hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
  })

  test('preserves localhost and existing prefixed hosts', () => {
    expect(resolveTemplateProviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveTemplateProviderHost('https://template.hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
    expect(resolveDbproviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveDbproviderHost('https://dbprovider.hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
  })
})
