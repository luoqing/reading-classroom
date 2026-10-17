import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AdminDashboardResult,
  ReadingHistoryItem,
  StudentAccountInput,
  StudentCredential,
} from '@shared/api.interface';

export async function getDashboard() {
  const response = await axiosForBackend<AdminDashboardResult>({ url: '/api/admin/dashboard', method: 'GET' });
  return response.data;
}

export async function createStudents(students: StudentAccountInput[]) {
  const response = await axiosForBackend<{ credentials: StudentCredential[] }>({
    url: '/api/admin/students', method: 'POST', data: { students },
  });
  return response.data.credentials;
}

export async function setStudentStatus(id: string, status: 'active' | 'disabled') {
  await axiosForBackend({ url: `/api/admin/students/${id}/status`, method: 'PATCH', data: { status } });
}

export async function resetStudentPassword(id: string) {
  const response = await axiosForBackend<StudentCredential>({
    url: `/api/admin/students/${id}/reset-password`, method: 'POST',
  });
  return response.data;
}

export async function getStudentAttempts(id: string) {
  const response = await axiosForBackend<{ items: ReadingHistoryItem[] }>({
    url: `/api/admin/students/${id}/attempts`, method: 'GET',
  });
  return response.data.items;
}
