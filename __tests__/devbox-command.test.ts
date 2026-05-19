import { describe, expect, test } from 'vitest'
import {
  buildCreateDevboxBody,
  buildReleaseBody,
  buildUpdateDevboxBody,
  createDevboxCommand,
  parseNumericValue,
  parsePortSpec
} from '../src/commands/devbox/index.ts'

describe('devbox command', () => {
  test('registers all OpenAPI-backed devbox subcommands', () => {
    const command = createDevboxCommand()
    expect(command.name()).toBe('devbox')
    expect(command.aliases()).toContain('dev')
    expect(command.commands.map(subcommand => subcommand.name())).toEqual([
      'list',
      'create',
      'get',
      'update',
      'delete',
      'start',
      'pause',
      'shutdown',
      'restart',
      'autostart',
      'monitor',
      'templates',
      'releases',
      'deployments'
    ])
  })

  test('builds create request body from CLI options', () => {
    expect(buildCreateDevboxBody({
      name: 'my-devbox',
      runtime: 'node.js',
      cpu: '1c',
      memory: '2g',
      port: ['8080:http:public', 'number=9000,protocol=grpc,isPublic=false,customDomain=api.example.com'],
      env: ['NODE_ENV=development'],
      secretEnv: ['OPENAI_API_KEY=openai:key'],
      autostart: true
    })).toEqual({
      name: 'my-devbox',
      runtime: 'node.js',
      quota: {
        cpu: 1,
        memory: 2
      },
      ports: [
        { number: 8080, protocol: 'http', isPublic: true },
        { number: 9000, protocol: 'grpc', isPublic: false, customDomain: 'api.example.com' }
      ],
      env: [
        { name: 'NODE_ENV', value: 'development' },
        { name: 'OPENAI_API_KEY', valueFrom: { secretKeyRef: { name: 'openai', key: 'key' } } }
      ],
      autostart: true
    })
  })

  test('builds update request body only for provided fields', () => {
    expect(buildUpdateDevboxBody({
      cpu: '0.5',
      memory: undefined,
      port: ['portName=web,number=3000,protocol=ws,isPublic=true']
    })).toEqual({
      quota: {
        cpu: 0.5
      },
      ports: [
        { portName: 'web', number: 3000, protocol: 'ws', isPublic: true }
      ]
    })
  })

  test('builds async release request body', () => {
    expect(buildReleaseBody({
      tag: 'v1-0-0',
      description: 'First release',
      execCommand: 'npm start',
      noStart: true
    })).toEqual({
      tag: 'v1-0-0',
      releaseDescription: 'First release',
      execCommand: 'npm start',
      startDevboxAfterRelease: false
    })
  })

  test('validates devbox resource and port options', () => {
    expect(parseNumericValue('4Gi', 'memory')).toBe(4)
    expect(() => parseNumericValue('0.01', 'cpu')).toThrow(/between 0.1 and 32/)
    expect(parsePortSpec('8080')).toEqual({ number: 8080 })
    expect(() => parsePortSpec('broken:http')).toThrow(/Invalid port number/)
    expect(() => buildUpdateDevboxBody({ port: [] })).toThrow(/Provide at least one/)
  })
})
