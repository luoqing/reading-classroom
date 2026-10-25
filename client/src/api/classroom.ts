import type {
  AdminDashboardFilters,
  AdminDashboardResult,
  IllustrationGenerateRequest,
  IllustrationGenerateResult,
  LessonDraftInput,
  LessonDemoAudioResult,
  LessonRecognitionRequest,
  LessonRecognitionResult,
  LessonView,
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

export async function resetStudentPassword(id: string, newPassword?: string) {
  const response = await apiRequest<StudentCredential>({
    url: `/api/admin/students/${id}/reset-password`, method: 'POST', data: { newPassword },
  });
  return response.data;
}

export async function recognizeLesson(input: LessonRecognitionRequest) {
  const response = await apiRequest<LessonRecognitionResult>({
    url: '/api/lessons/admin/recognize', method: 'POST', data: input,
  });
  return response.data;
}

export async function generateLessonIllustration(input: IllustrationGenerateRequest) {
  const response = await apiRequest<IllustrationGenerateResult>({
    url: '/api/lessons/admin/illustrations', method: 'POST', data: input,
  });
  return response.data;
}

export async function generateLessonDemoAudio(text: string) {
  const response = await apiRequest<LessonDemoAudioResult>({
    url: '/api/lessons/admin/demo-audio', method: 'POST', data: { text },
  });
  return response.data;
}

export async function uploadLessonDemoRecording(dataUrl: string) {
  const response = await apiRequest<LessonDemoAudioResult>({
    url: '/api/lessons/admin/demo-audio/recording', method: 'POST', data: { dataUrl },
  });
  return response.data;
}

export async function saveLesson(input: LessonDraftInput) {
  const response = await apiRequest<LessonView>({
    url: '/api/lessons/admin/save', method: 'POST', data: input,
  });
  return response.data;
}

export async function getAdminLesson(id: string) {
  const response = await apiRequest<LessonView>({
    url: `/api/lessons/admin/${id}`, method: 'GET',
  });
  return response.data;
}

export async function getStudentAttempts(id: string) {
  const response = await apiRequest<{ items: ReadingHistoryItem[] }>({
    url: `/api/admin/students/${id}/attempts`, method: 'GET',
  });
  return response.data.items;
}
