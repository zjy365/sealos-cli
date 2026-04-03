import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { validateDirectKubeconfigInput } from '../src/commands/auth/login.ts'
import { resolveDbproviderHost, resolveTemplateProviderHost } from '../src/lib/api-client.ts'
import {
  buildCatalogTemplateDeployBody,
  buildRawTemplateDeployBody,
  resolveTemplateDeployMode
} from '../src/commands/template/index.ts'

describe('template deploy validation', () => {
  test('rejects dry-run for catalog deploys', () => {
    assert.throws(
      () => resolveTemplateDeployMode('perplexica', {
        name: 'app',
        set: [],
        dryRun: true
      }, true),
      /--dry-run is only supported for raw template deploys/
    )
  })

  test('rejects mixed catalog and raw inputs', () => {
    assert.throws(
      () => resolveTemplateDeployMode('perplexica', {
        name: 'app',
        file: './template.yaml',
        set: []
      }, true),
      /Cannot specify both a template name and --file\/--yaml\/stdin/
    )
  })

  test('requires --name for catalog deploys', () => {
    assert.throws(
      () => resolveTemplateDeployMode('perplexica', {
        set: []
      }, true),
      /--name is required when deploying from the template catalog/
    )
  })

  test('builds catalog deploy request body without dryRun', () => {
    assert.deepStrictEqual(
      buildCatalogTemplateDeployBody('perplexica', {
        name: 'app',
        set: ['OPENAI_API_KEY=secret']
      }),
      {
        name: 'app',
        template: 'perplexica',
        args: {
          OPENAI_API_KEY: 'secret'
        }
      }
    )
  })

  test('builds raw deploy request body with dryRun', () => {
    assert.deepStrictEqual(
      buildRawTemplateDeployBody('apiVersion: app.sealos.io/v1\nkind: Template', {
        set: ['OPENAI_API_KEY=secret'],
        dryRun: true
      }),
      {
        yaml: 'apiVersion: app.sealos.io/v1\nkind: Template',
        args: {
          OPENAI_API_KEY: 'secret'
        },
        dryRun: true
      }
    )
  })
})

describe('direct kubeconfig login validation', () => {
  test('accepts kubeconfig yaml input', () => {
    const kubeconfig = `
apiVersion: v1
clusters:
  - cluster:
      server: https://example.com
    name: demo
contexts:
  - context:
      cluster: demo
      user: demo
    name: demo
users:
  - name: demo
    user:
      token: abc
`

    assert.strictEqual(validateDirectKubeconfigInput(kubeconfig), kubeconfig.trim())
  })

  test('accepts kubeconfig json input', () => {
    const kubeconfig = JSON.stringify({
      apiVersion: 'v1',
      clusters: [],
      contexts: [],
      users: []
    })

    assert.strictEqual(validateDirectKubeconfigInput(kubeconfig), kubeconfig)
  })

  test('rejects plain access tokens', () => {
    assert.throws(
      () => validateDirectKubeconfigInput('plain-access-token'),
      /--token now expects kubeconfig content, not an access token/
    )
  })
})

describe('help output', () => {
  test('template deploy help documents raw-only dry-run', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'template', 'deploy', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    assert.match(help, /Validate raw template YAML without creating resources/)
    assert.match(help, /Catalog:/)
    assert.match(help, /Raw:/)
  })

  test('login help documents kubeconfig login', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'login', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    assert.match(help, /Login with kubeconfig content/)
    assert.match(help, /cat ~\/\.kube\/config/)
  })
})

describe('api client host resolution', () => {
  test('adds template prefix for template service hosts', () => {
    assert.strictEqual(
      resolveTemplateProviderHost('https://hzh.sealos.run'),
      'https://template.hzh.sealos.run'
    )
  })

  test('adds dbprovider prefix for database service hosts', () => {
    assert.strictEqual(
      resolveDbproviderHost('https://hzh.sealos.run'),
      'https://dbprovider.hzh.sealos.run'
    )
  })

  test('preserves localhost and existing prefixed hosts', () => {
    assert.strictEqual(
      resolveTemplateProviderHost('http://localhost:3000'),
      'http://localhost:3000'
    )
    assert.strictEqual(
      resolveTemplateProviderHost('https://template.hzh.sealos.run'),
      'https://template.hzh.sealos.run'
    )
    assert.strictEqual(
      resolveDbproviderHost('http://localhost:3000'),
      'http://localhost:3000'
    )
    assert.strictEqual(
      resolveDbproviderHost('https://dbprovider.hzh.sealos.run'),
      'https://dbprovider.hzh.sealos.run'
    )
  })
})
