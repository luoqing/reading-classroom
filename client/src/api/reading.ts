import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { uploadFile } from '../components/business-ui/api/files/service';
import { isAxiosError } from 'axios';
import type {
  EvaluationReportRequest,
  ReadingHistoryItem,
  ReadingResult,
  StoredClip,
} from '../../../shared/api.interface';

function base64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

interface ClipUploadInput {
  blob: Blob;
  duration: number;
  sequenceNo: number;
  clipType: 'cover' | 'body';
}

export async function evaluateReading(
  lessonSlug: string,
  text: string,
  pcm: ArrayBuffer,
  sourceBlob: Blob,
  recordingMode: 'full_text' | 'dubbing' = 'full_text',
  clipInputs: ClipUploadInput[] = [],
): Promise<ReadingResult> {
  try {
    const stored = await uploadFile(new File([sourceBlob], `reading-${crypto.randomUUID()}.${sourceBlob.type.includes('wav') ? 'wav' : 'webm'}`, { type: sourceBlob.type }));
    const clips: StoredClip[] = [];
    for (const clip of clipInputs) {
      const uploaded = await uploadFile(new File([clip.blob], `reading-clip-${clip.sequenceNo}-${crypto.randomUUID()}.webm`, { type: clip.blob.type }));
      clips.push({
        bucketId: uploaded.bucketId,
        filePath: uploaded.filePath,
        mimeType: clip.blob.type,
        durationMs: Math.round(clip.duration * 1000),
        pageId: null,
        sequenceNo: clip.sequenceNo,
        clipType: clip.clipType,
      });
    }
    const response = await axiosForBackend<ReadingResult>({
      url: '/api/reading/evaluate', method: 'POST',
      data: {
        lessonSlug,
        text,
        audio: base64(pcm),
        recordingMode,
        storedAudio: {
          bucketId: stored.bucketId,
          filePath: stored.filePath,
          mimeType: sourceBlob.type,
          durationMs: Math.round(pcm.byteLength / 2 / 16),
        },
        clips,
      },
      timeout: 125000,
      meta: { autoJumpToLogin: false },
    });
    return response.data;
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.response?.status === 401) throw new Error('登录已过期，请刷新后重新登录。');
      if (error.response?.status === 403) throw new Error('当前无法访问评测，请刷新页面后重试。');
      throw new Error(error.response?.data?.error?.message || '评测请求失败，录音已保存，请稍后重试。');
    }
    throw error;
  }
}

export async function saveEvaluationReport(evaluationId: string, report: EvaluationReportRequest) {
  await axiosForBackend({
    url: `/api/reading/evaluations/${evaluationId}/report`,
    method: 'PATCH',
    data: report,
    meta: { autoJumpToLogin: false },
  });
}

export async function getReadingHistory() {
  const response = await axiosForBackend<{ items: ReadingHistoryItem[] }>({
    url: '/api/reading/history', method: 'GET', meta: { autoJumpToLogin: false },
  });
  return response.data.items;
}
