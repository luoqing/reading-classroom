import { isAxiosError } from 'axios';
import type {
  EvaluationReportRequest,
  GuestReadingResult,
  ReadingEvaluationMode,
  ReadingHistoryItem,
  ReadingResult,
  StoredClip,
} from '../../../shared/api.interface';
import { apiRequest } from './http';

function base64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function evaluateGuestReading(
  text: string,
  pcm: ArrayBuffer,
  provider: ReadingEvaluationMode,
): Promise<GuestReadingResult> {
  try {
    const response = await apiRequest<GuestReadingResult>({
      url: '/api/reading/evaluate-guest',
      method: 'POST',
      data: { text, audio: base64(pcm), provider },
      timeout: 125000,
      meta: { autoJumpToLogin: false },
    });
    return response.data;
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.response?.status === 429) throw new Error('当前练习较多，请稍后再提交。');
      throw new Error(error.response?.data?.error?.message || '评测请求失败，请稍后重试。');
    }
    throw error;
  }
}

interface ClipUploadInput {
  blob: Blob;
  duration: number;
  pageId?: string;
  sequenceNo: number;
  clipType: 'cover' | 'body';
}

export async function evaluateReading(
  lessonSlug: string,
  text: string,
  pcm: ArrayBuffer,
  sourceBlob: Blob,
  provider: ReadingEvaluationMode,
  recordingMode: 'full_text' | 'dubbing' = 'full_text',
  clipInputs: ClipUploadInput[] = [],
): Promise<ReadingResult> {
  try {
    const { uploadFile } = await import('../components/business-ui/api/files/service');
    const stored = await uploadFile(new File([sourceBlob], `reading-${crypto.randomUUID()}.${sourceBlob.type.includes('wav') ? 'wav' : 'webm'}`, { type: sourceBlob.type }));
    const clips: StoredClip[] = [];
    for (const clip of clipInputs) {
      const uploaded = await uploadFile(new File([clip.blob], `reading-clip-${clip.sequenceNo}-${crypto.randomUUID()}.webm`, { type: clip.blob.type }));
      clips.push({
        bucketId: uploaded.bucketId,
        filePath: uploaded.filePath,
        mimeType: clip.blob.type,
        durationMs: Math.round(clip.duration * 1000),
        pageId: clip.pageId || null,
        sequenceNo: clip.sequenceNo,
        clipType: clip.clipType,
      });
    }
    const response = await apiRequest<ReadingResult>({
      url: '/api/reading/evaluate', method: 'POST',
      data: {
        lessonSlug,
        text,
        audio: base64(pcm),
        provider,
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
  await apiRequest({
    url: `/api/reading/evaluations/${evaluationId}/report`,
    method: 'PATCH',
    data: report,
    meta: { autoJumpToLogin: false },
  });
}

export async function getReadingHistory() {
  const response = await apiRequest<{ items: ReadingHistoryItem[] }>({
    url: '/api/reading/history', method: 'GET', meta: { autoJumpToLogin: false },
  });
  return response.data.items;
}

export async function getTeacherSpeechClip(key: string): Promise<ArrayBuffer> {
  const response = await apiRequest<ArrayBuffer>({
    url: `/api/reading/teacher-speech/${encodeURIComponent(key)}`,
    method: 'GET',
    responseType: 'arraybuffer',
    meta: { autoJumpToLogin: false },
  });
  return response.data;
}
