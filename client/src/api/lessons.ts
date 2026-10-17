import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { LessonView } from '@shared/api.interface';

export async function getLesson(slug: string) {
  const response = await axiosForBackend<LessonView>({
    url: `/api/lessons/${slug}`,
    method: 'GET',
    meta: { autoJumpToLogin: false },
  });
  return response.data;
}
