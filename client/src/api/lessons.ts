import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { LessonListItem, LessonView } from '@shared/api.interface';

export async function listLessons() {
  const response = await axiosForBackend<{ items: LessonListItem[] }>({
    url: '/api/lessons',
    method: 'GET',
    meta: { autoJumpToLogin: false },
  });
  return response.data.items;
}

export async function getLesson(slug: string) {
  const response = await axiosForBackend<LessonView>({
    url: `/api/lessons/${slug}`,
    method: 'GET',
    meta: { autoJumpToLogin: false },
  });
  return response.data;
}
