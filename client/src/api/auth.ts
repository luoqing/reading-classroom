import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { LoginRequest, LoginResult } from '@shared/api.interface';

export async function getSession(): Promise<LoginResult | null> {
  const response = await axiosForBackend<LoginResult | null>({
    url: '/api/auth/me', method: 'GET', meta: { autoJumpToLogin: false },
  });
  return response.data;
}

export async function login(input: LoginRequest): Promise<LoginResult> {
  const response = await axiosForBackend<LoginResult>({
    url: '/api/auth/login', method: 'POST', data: input, meta: { autoJumpToLogin: false },
  });
  return response.data;
}

export async function logout() {
  await axiosForBackend({ url: '/api/auth/logout', method: 'POST', meta: { autoJumpToLogin: false } });
}
