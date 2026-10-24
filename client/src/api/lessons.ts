import type { LessonCatalog, LessonView } from '@shared/api.interface';
import { apiRequest } from './http';

export async function getLessonCatalog() {
  const response = await apiRequest<LessonCatalog>({
    url: '/api/lessons',
    method: 'GET',
    meta: { autoJumpToLogin: false },
  });
  return response.data;
}

export async function getLesson(slug: string) {
  const response = await apiRequest<LessonView>({
    url: `/api/lessons/${slug}`,
    method: 'GET',
    meta: { autoJumpToLogin: false },
  });
  return response.data;
}
