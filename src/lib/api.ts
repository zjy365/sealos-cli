import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { getCurrentContext } from './config.ts'

/**
 * API client base class
 */
export class ApiClient {
  private client: AxiosInstance

  constructor (baseURL?: string) {
    const context = getCurrentContext()

    this.client = axios.create({
      baseURL: baseURL || context?.host || '',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const context = getCurrentContext()
        if (context?.token) {
          config.headers.Authorization = `Bearer ${context.token}`
        }

        // Support KUBECONFIG environment variable
        const kubeconfig = process.env.KUBECONFIG
        if (kubeconfig) {
          config.headers['X-Kubeconfig'] = kubeconfig
        }

        return config
      },
      async (error) => await Promise.reject(error)
    )

    // Response interceptor - unified error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please run "sealos login" first.')
        }
        return await Promise.reject(error)
      }
    )
  }

  async get<T = any> (url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  async post<T = any> (url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  async put<T = any> (url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  async delete<T = any> (url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }

  async patch<T = any> (url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }
}

/**
 * Create API client instance
 */
export function createApiClient (baseURL?: string): ApiClient {
  return new ApiClient(baseURL)
}
