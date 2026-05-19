// Core type definitions

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

export interface SealosWorkspace {
  uid?: string
  id?: string
  teamName?: string
  role?: string
  nstype?: string
}

export interface SealosAuthData {
  region: string
  access_token?: string
  regional_token?: string
  authenticated_at?: string
  auth_method?: string
  current_workspace?: {
    uid?: string
    id?: string
    teamName?: string
  }
}
