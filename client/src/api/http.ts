import axios, { type AxiosRequestConfig } from 'axios';

type RequestConfig = AxiosRequestConfig & {
  meta?: { autoJumpToLogin?: boolean };
};

export function apiRequest<T = unknown>(config: RequestConfig) {
  const { meta: _meta, ...axiosConfig } = config;
  return axios.request<T>({
    withCredentials: true,
    ...axiosConfig,
  });
}
