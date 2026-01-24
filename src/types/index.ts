// Core type definitions

export interface SealosConfig {
  currentContext: string
  contexts: Context[]
}

export interface Context {
  name: string
  host: string
  token: string
  workspace: string
}

export interface DevboxConfig {
  name?: string
  template: string
  resources: {
    cpu: string
    memory: string
    storage?: string
  }
  ports?: number[]
  env?: Record<string, string>
}

export interface OutputOptions {
  format: 'json' | 'yaml' | 'table'
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}
