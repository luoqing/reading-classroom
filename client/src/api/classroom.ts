import type {
  AdminDashboardFilters,
  AdminDashboardResult,
  ReadingHistoryItem,
  StudentAccountInput,
  StudentCredential,
} from '@shared/api.interface';
import { apiRequest } from './http';

export async function getDashboard(filters: AdminDashboardFilters = {}) {
  const response = await apiRequest<AdminDashboardResult>({
    url: '/api/admin/dashboard',
    method: 'GET',
    params: filters,
  });
  return response.data;
}

export async function createStudents(students: StudentAccountInput[]) {
  const response = await apiRequest<{ credentials: StudentCredential[] }>({
    url: '/api/admin/students', method: 'POST', data: { students },
  });
  return response.data.credentials;
}

export async function setStudentStatus(id: string, status: 'active' | 'disabled') {
  await apiRequest({ url: `/api/admin/students/${id}/status`, method: 'PATCH', data: { status } });
}

export async function resetStudentPassword(id: string) {
  const response = await apiRequest<StudentCredential>({
    url: `/api/admin/students/${id}/reset-password`, method: 'POST',
  });
  return response.data;
}

export async function getStudentAttempts(id: string) {
  const response = await apiRequest<{ items: ReadingHistoryItem[] }>({
    url: `/api/admin/students/${id}/attempts`, method: 'GET',
  });
  return response.data.items;
}
