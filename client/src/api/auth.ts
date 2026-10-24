import type { LoginRequest, LoginResult } from '@shared/api.interface';
import { apiRequest } from './http';

export async function getSession(): Promise<LoginResult | null> {
  const response = await apiRequest<LoginResult | null>({
    url: '/api/auth/me', method: 'GET', meta: { autoJumpToLogin: false },
  });
  return response.data;
}

export async function login(input: LoginRequest): Promise<LoginResult> {
  const response = await apiRequest<LoginResult>({
    url: '/api/auth/login', method: 'POST', data: input, meta: { autoJumpToLogin: false },
  });
  return response.data;
}

export async function logout() {
  await apiRequest({ url: '/api/auth/logout', method: 'POST', meta: { autoJumpToLogin: false } });
}
