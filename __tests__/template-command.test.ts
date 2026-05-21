import { describe, expect, test } from 'vitest'
import {
  buildCatalogTemplateDeployBody,
  buildRawTemplateDeployBody,
  createTemplateCommand,
  resolveTemplateDeployMode
} from '../src/commands/template/index.ts'

describe('template command', () => {
  test('registers all OpenAPI-backed template subcommands', () => {
    const command = createTemplateCommand()
    expect(command.name()).toBe('template')
    expect(command.aliases()).toContain('tpl')
    expect(command.commands.map(subcommand => subcommand.name())).toEqual([
      'list',
      'get',
      'delete',
      'deploy'
    ])

    const list = command.commands.find(subcommand => subcommand.name() === 'list')
    const get = command.commands.find(subcommand => subcommand.name() === 'get')
    const remove = command.commands.find(subcommand => subcommand.name() === 'delete')

    expect(list?.options.map(option => option.long)).toContain('--language')
    expect(get?.options.map(option => option.long)).toContain('--language')
    expect(remove?.aliases()).toContain('rm')
  })

  test('parses template deploy args and preserves empty values', () => {
    expect(
      buildCatalogTemplateDeployBody('perplexica', {
        name: 'app',
        set: ['OPENAI_API_KEY=secret', 'OPTIONAL_EMPTY=']
      })
    ).toEqual({
      name: 'app',
      template: 'perplexica',
      args: {
        OPENAI_API_KEY: 'secret',
        OPTIONAL_EMPTY: ''
      }
    })
  })

  test('rejects dry-run for catalog deploys', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        set: [],
        dryRun: true,
        output: 'json'
      }, true)
    }).toThrow(/--dry-run is only supported for raw template deploys/)
  })

  test('rejects mixed catalog and raw inputs', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        file: './template.yaml',
        set: [],
        output: 'json'
      }, true)
    }).toThrow(/Cannot specify both a template name and --file\/--yaml/)
  })

  test('catalog deploy is not treated as stdin raw input in non-tty environments', () => {
    expect(resolveTemplateDeployMode('rybbit', { set: [], output: 'json' }, false)).toBe('catalog')
  })

  test('defaults catalog instance name to template name', () => {
    expect(resolveTemplateDeployMode('rybbit', { set: [], output: 'json' }, true)).toBe('catalog')
    expect(
      buildCatalogTemplateDeployBody('rybbit', {
        set: []
      })
    ).toEqual({
      name: 'rybbit',
      template: 'rybbit'
    })
  })

  test('builds catalog deploy request body with explicit instance name', () => {
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

  test('builds catalog deploy request body with default instance name', () => {
    expect(
      buildCatalogTemplateDeployBody('rybbit', {
        set: []
      })
    ).toEqual({
      name: 'rybbit',
      template: 'rybbit'
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
