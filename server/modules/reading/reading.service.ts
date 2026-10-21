import WebSocket from 'ws';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import type {
  EvaluationReportRequest,
  GuestReadingRequest,
  GuestReadingResult,
  ProviderEvaluationError,
  ProviderEvaluationResult,
  ReadingEvaluationMode,
  ReadingEvaluationProvider,
  ReadingHistoryItem,
  ReadingRequest,
  ReadingResult,
} from '../../../shared/api.interface';
import { lesson, lessonPage, readingAttempt, readingClip, readingEvaluation, studentLessonProgress } from '@server/database/schema';
import { signedStoredFileUrl } from '@server/common/storage-url';
import { callTencentSoe, configuredTencentSoe } from './tencent-soe.provider';

interface ProviderResult {
  provider: ReadingEvaluationProvider;
  rawResult: string;
  sid?: string;
}

interface ProviderBatchResult {
  evaluations: ProviderResult[];
  errors: ProviderEvaluationError[];
}

const TEACHER_SPEECH_ROOT = 'https://bytedance.feishuapp.cn/spark/app/'
  + 'app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/';

const TEACHER_SPEECH_FILES: Record<string, string> = {
  intro: '1879581960034618.mp3',
  'fluency-1': '1879581941482555.mp3',
  'fluency-2': '1879581941482523.mp3',
  'fluency-3': '1879581938221194.mp3',
  'fluency-review': '1879581941482507.mp3',
  'correctness-1': '1879581960034586.mp3',
  'correctness-2': '1879581938220218.mp3',
  'correctness-3': '1879581938220186.mp3',
  'correctness-review': '1879581941482539.mp3',
  'accuracy-1': '1879288711764233.mp3',
  'accuracy-2': '1879288709002265.mp3',
  'accuracy-3': '1879288711765033.mp3',
  'accuracy-review': '1879288719748155.mp3',
  'natural-1': '1879288849802331.mp3',
  'natural-2': '1879288855539723.mp3',
  'natural-3': '1879288842819691.mp3',
  'natural-review': '1879288855542859.mp3',
  'delivery-1': '1879288829616266.mp3',
  'delivery-2': '1879288829617354.mp3',
  'delivery-3': '1879288818236442.mp3',
  'delivery-review': '1879288836554761.mp3',
  'practice-accuracy': '1879288855542875.mp3',
  'practice-natural': '1879288877263881.mp3',
  'practice-delivery': '1879288870945801.mp3',
  'practice-general': '1879288870945833.mp3',
  'practice-fluency': '1879581941483595.mp3',
  'practice-correctness': '1879581938220202.mp3',
  'all-clear': '1879581960034570.mp3',
};

@Injectable()
export class ReadingService {
  private readonly logger = new Logger(ReadingService.name);
  private active = 0;
  private started: number[] = [];

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
    private readonly http: HttpService,
  ) {}

  async teacherSpeech(key: string): Promise<Buffer> {
    const fileName: string | undefined = TEACHER_SPEECH_FILES[key];
    if (!fileName) throw new NotFoundException('小秋评语音频不存在。');
    try {
      const response = await firstValueFrom(this.http.get<ArrayBuffer>(
        TEACHER_SPEECH_ROOT + fileName,
        { responseType: 'arraybuffer' },
      ));
      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(
        `Failed to load teacher speech clip: ${key}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException('小秋评语音频暂时不可用，请稍后重试。');
    }
  }

  configured(provider: ReadingEvaluationProvider = 'xfyun'): boolean {
    if (provider === 'tencent') return configuredTencentSoe();
    return Boolean(
      process.env.XFYUN_APP_ID
        && process.env.XFYUN_API_KEY
        && process.env.XFYUN_API_SECRET,
    );
  }

  async evaluate(input: ReadingRequest, studentId: string): Promise<ReadingResult> {
    const audio = this.validateAudio(input);
    if (!input.storedAudio?.bucketId || !input.storedAudio.filePath || !input.lessonSlug) {
      throw new BadRequestException('录音尚未保存，请重新录音。');
    }
    const [lessonRecord] = await this.db.select().from(lesson)
      .where(eq(lesson.slug, input.lessonSlug)).limit(1);
    if (!lessonRecord || lessonRecord.status !== 'published') throw new NotFoundException('课文不存在');
    if (input.text.trim() !== lessonRecord.fullText.trim()) throw new BadRequestException('课文内容已更新，请刷新后重试');
    const [attempt] = await this.db.insert(readingAttempt).values({
      studentId,
      lessonId: lessonRecord.id,
      lessonRevision: lessonRecord.revision,
      recordingMode: input.recordingMode || 'full_text',
      status: 'recorded',
      audioBucketId: input.storedAudio.bucketId,
      audioFilePath: input.storedAudio.filePath,
      audioMimeType: input.storedAudio.mimeType,
      audioDurationMs: input.storedAudio.durationMs,
    }).returning();
    if (input.clips?.length) {
      const pages = await this.db.select().from(lessonPage)
        .where(eq(lessonPage.lessonId, lessonRecord.id));
      for (const clip of input.clips) {
        const pageId = clip.pageId || pages.find(page => page.pageNo === clip.sequenceNo + 1)?.id || null;
        await this.db.insert(readingClip).values({
          attemptId: attempt.id,
          lessonPageId: pageId,
          sequenceNo: clip.sequenceNo,
          clipType: clip.clipType,
          audioBucketId: clip.bucketId,
          audioFilePath: clip.filePath,
          audioMimeType: clip.mimeType,
          audioDurationMs: clip.durationMs,
        });
      }
    }
    await this.db.insert(studentLessonProgress).values({
      studentId,
      lessonId: lessonRecord.id,
      latestAttemptId: attempt.id,
      attemptCount: 1,
      lastPracticedAt: new Date(),
    }).onConflictDoUpdate({
      target: [studentLessonProgress.studentId, studentLessonProgress.lessonId],
      set: {
        latestAttemptId: attempt.id,
        attemptCount: sql`${studentLessonProgress.attemptCount} + 1`,
        lastPracticedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    try {
      const batch: ProviderBatchResult = await this.evaluateProviders(
        input.provider,
        input.text,
        audio,
        true,
      );
      const evaluations: ProviderEvaluationResult[] = [];
      for (const providerResult of batch.evaluations) {
        const [evaluation] = await this.db.insert(readingEvaluation).values({
          attemptId: attempt.id,
          versionNo: providerResult.provider === 'xfyun' ? 1 : 2,
          provider: providerResult.provider,
          providerSid: providerResult.sid,
          algorithmVersion: providerResult.provider === 'xfyun'
            ? 'xfyun-common-v2-three-dimension-20261017'
            : 'tencent-soe-v1-segment-20261018',
          rawXml: providerResult.rawResult,
        }).returning();
        evaluations.push({
          provider: providerResult.provider,
          evaluationId: evaluation.id,
          rawResult: providerResult.rawResult,
          sid: providerResult.sid,
        });
      }
      if (!evaluations.length) {
        throw new BadGatewayException(batch.errors[0]?.message || '评测失败，请重试。');
      }
      await this.db.update(readingAttempt).set({ status: 'evaluated', updatedAt: new Date() })
        .where(eq(readingAttempt.id, attempt.id));
      const latestEvaluation: ProviderEvaluationResult = evaluations.find(
        (item: ProviderEvaluationResult) => item.provider === 'xfyun',
      ) || evaluations[0];
      await this.db.update(studentLessonProgress).set({
        latestEvaluationId: latestEvaluation.evaluationId,
        updatedAt: new Date(),
      }).where(and(
        eq(studentLessonProgress.studentId, studentId),
        eq(studentLessonProgress.lessonId, lessonRecord.id),
      ));
      return { attemptId: attempt.id, evaluations, errors: batch.errors };
    } catch (error) {
      await this.db.update(readingAttempt).set({ status: 'evaluation_failed', updatedAt: new Date() })
        .where(eq(readingAttempt.id, attempt.id));
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(error instanceof Error ? error.message : '评测失败，请重试。');
    }
  }

  async evaluateGuest(input: GuestReadingRequest): Promise<GuestReadingResult> {
    const audio = this.validateAudio(input);
    const batch: ProviderBatchResult = await this.evaluateProviders(
      input.provider,
      input.text,
      audio,
      false,
    );
    if (!batch.evaluations.length) {
      throw new BadGatewayException(batch.errors[0]?.message || '评测失败，请重试。');
    }
    return {
      evaluations: batch.evaluations.map((item: ProviderResult) => ({
        provider: item.provider,
        rawResult: item.rawResult,
        sid: item.sid,
      })),
      errors: batch.errors,
    };
  }

  private requestedProviders(mode: ReadingEvaluationMode): ReadingEvaluationProvider[] {
    if (mode === 'both') return ['xfyun', 'tencent'];
    if (mode === 'xfyun' || mode === 'tencent') return [mode];
    throw new BadRequestException('请选择讯飞评测、腾讯评测或双评测。');
  }

  private async evaluateProviders(
    mode: ReadingEvaluationMode,
    text: string,
    audio: Buffer,
    recordingStored: boolean,
  ): Promise<ProviderBatchResult> {
    const requested: ReadingEvaluationProvider[] = this.requestedProviders(mode);
    const available: ReadingEvaluationProvider[] = requested.filter(
      (provider: ReadingEvaluationProvider) => this.configured(provider),
    );
    const errors: ProviderEvaluationError[] = requested
      .filter((provider: ReadingEvaluationProvider) => !this.configured(provider))
      .map((provider: ReadingEvaluationProvider) => ({
        provider,
        message: provider === 'xfyun'
          ? '老师尚未配置讯飞服务。'
          : '老师尚未配置腾讯评测服务。',
      }));
    if (!available.length) {
      throw new ServiceUnavailableException(errors[0]?.message || '老师尚未配置评测服务。');
    }
    const now = Date.now();
    this.started = this.started.filter((time: number) => now - time < 3600000);
    if (this.active >= 2 || this.started.length >= 60) {
      throw new HttpException(
        recordingStored
          ? '当前练习较多，请稍后再提交。录音已保留。'
          : '当前练习较多，请稍后再提交。',
        429,
      );
    }
    this.active++;
    this.started.push(now);
    try {
      const settled: PromiseSettledResult<ProviderResult>[] = await Promise.allSettled(
        available.map((provider: ReadingEvaluationProvider) => this.callProvider(provider, text, audio)),
      );
      const evaluations: ProviderResult[] = [];
      settled.forEach((result: PromiseSettledResult<ProviderResult>, index: number) => {
        const provider: ReadingEvaluationProvider = available[index];
        if (result.status === 'fulfilled') evaluations.push(result.value);
        else errors.push({
          provider,
          message: result.reason instanceof Error
            ? result.reason.message
            : `${provider === 'xfyun' ? '讯飞' : '腾讯'}评测失败，请重试。`,
        });
      });
      return { evaluations, errors };
    } finally {
      this.active--;
    }
  }

  async saveReport(evaluationId: string, studentId: string, report: EvaluationReportRequest) {
    const [owned] = await this.db.select({ evaluation: readingEvaluation })
      .from(readingEvaluation)
      .innerJoin(readingAttempt, eq(readingAttempt.id, readingEvaluation.attemptId))
      .where(and(eq(readingEvaluation.id, evaluationId), eq(readingAttempt.studentId, studentId)))
      .limit(1);
    if (!owned) throw new NotFoundException('评测记录不存在');
    const scores = report.scores || {};
    const [updated] = await this.db.update(readingEvaluation).set({
      totalScore: scores.total_score === null || scores.total_score === undefined ? null : String(scores.total_score),
      accuracyScore: scores.accuracy_score === null || scores.accuracy_score === undefined ? null : String(scores.accuracy_score),
      fluencyScore: scores.fluency_score === null || scores.fluency_score === undefined ? null : String(scores.fluency_score),
      integrityScore: scores.integrity_score === null || scores.integrity_score === undefined ? null : String(scores.integrity_score),
      toneScore: scores.tone_score === null || scores.tone_score === undefined ? null : String(scores.tone_score),
      accuracyStars: report.accuracyStars,
      naturalStars: report.naturalStars,
      deliveryStars: report.deliveryStars,
      teacherComment: report.teacherComment?.slice(0, 4000) || '',
      aligned: Boolean(report.aligned),
      issueCount: Math.max(0, Number(report.issueCount) || 0),
      reportJson: report.report || {},
      updatedAt: new Date(),
    }).where(eq(readingEvaluation.id, evaluationId)).returning();
    return { id: updated.id };
  }

  async history(studentId: string): Promise<ReadingHistoryItem[]> {
    const rows = await this.db.select({
      attempt: readingAttempt,
      evaluation: readingEvaluation,
      lessonTitle: lesson.title,
    }).from(readingAttempt)
      .innerJoin(lesson, eq(lesson.id, readingAttempt.lessonId))
      .leftJoin(readingEvaluation, eq(readingEvaluation.attemptId, readingAttempt.id))
      .where(eq(readingAttempt.studentId, studentId))
      .orderBy(desc(readingAttempt.recordedAt), asc(readingEvaluation.versionNo));
    const seenAttempts = new Set<string>();
    const uniqueRows = rows.filter(row => {
      if (seenAttempts.has(row.attempt.id)) return false;
      seenAttempts.add(row.attempt.id);
      return true;
    });
    return Promise.all(uniqueRows.map(async row => ({
      attemptId: row.attempt.id,
      evaluationId: row.evaluation?.id || null,
      lessonTitle: row.lessonTitle,
      recordedAt: row.attempt.recordedAt.toISOString(),
      recordingMode: row.attempt.recordingMode,
      audioUrl: await signedStoredFileUrl(this.files, row.attempt.audioBucketId, row.attempt.audioFilePath),
      accuracyStars: row.evaluation?.accuracyStars ?? null,
      naturalStars: row.evaluation?.naturalStars ?? null,
      deliveryStars: row.evaluation?.deliveryStars ?? null,
      teacherComment: row.evaluation?.teacherComment || null,
      issueCount: row.evaluation?.issueCount ?? null,
      report: row.evaluation ? row.evaluation.reportJson as Record<string, unknown> : null,
    })));
  }

  private validateAudio(input: GuestReadingRequest): Buffer {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 500) {
      throw new BadRequestException('课文正文需要1至500字。');
    }
    if (typeof input.audio !== 'string' || input.audio.length > 3882700 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio)) {
      throw new BadRequestException('录音格式不正确，请重新录音。');
    }
    const audio = Buffer.from(input.audio, 'base64');
    if (audio.length < 16000 || audio.length > 2912000 || audio.length % 2 !== 0) {
      throw new BadRequestException('请录制0.5至90秒的音频。');
    }
    return audio;
  }

  private async callProvider(
    provider: ReadingEvaluationProvider,
    text: string,
    audio: Buffer,
  ): Promise<ProviderResult> {
    if (provider === 'tencent') {
      const result = await callTencentSoe(text, audio);
      return { provider, rawResult: result.rawResult, sid: result.sid };
    }
    const result = await this.callXfyunProvider(text, audio);
    return { provider, rawResult: result.rawResult, sid: result.sid };
  }

  private callXfyunProvider(text: string, audio: Buffer): Promise<ProviderResult> {
    const host = 'ise-api.xfyun.cn';
    const date = new Date().toUTCString();
    const signature = createHmac('sha256', process.env.XFYUN_API_SECRET!)
      .update(`host: ${host}\ndate: ${date}\nGET /v2/open-ise HTTP/1.1`).digest('base64');
    const authorization = Buffer.from(`api_key="${process.env.XFYUN_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`).toString('base64');
    const ws = new WebSocket(`wss://${host}/v2/open-ise?${new URLSearchParams({ authorization, date, host })}`, { handshakeTimeout: 20000 });
    return new Promise((resolve, reject) => {
      let finished = false;
      let offset = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => finish(new Error('讯飞评测超时，请重试。')), 115000);
      const finish = (error?: Error, value?: ProviderResult): void => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        clearTimeout(timer);
        ws.close();
        if (error) reject(error);
        else if (value) resolve(value);
      };
      ws.addEventListener('error', () => finish(new Error('讯飞连接失败，请检查服务配置或稍后重试。')));
      ws.addEventListener('close', () => {
        if (!finished) finish(new Error('讯飞连接提前关闭，请重试。'));
      });
      ws.addEventListener('message', (event: WebSocket.MessageEvent) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.code !== 0) {
            finish(new Error(`讯飞未完成评测（错误码 ${Number(data.code)}），请检查额度或录音。`));
          } else if (data.data?.status === 2) {
            if (!data.data.data) finish(new Error('讯飞未返回有效结果，请重新录音。'));
            else finish(undefined, {
              provider: 'xfyun',
              rawResult: Buffer.from(data.data.data, 'base64').toString('utf8'),
              sid: data.sid,
            });
          }
        } catch {
          finish(new Error('讯飞返回的数据无法解析，请重试。'));
        }
      });
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ common: { app_id: process.env.XFYUN_APP_ID }, business: {
          sub: 'ise', ent: 'cn_vip', category: 'read_chapter', cmd: 'ssb', text: '\ufeff' + text,
          tte: 'utf-8', ttp_skip: true, aue: 'raw', auf: 'audio/L16;rate=16000', rstcd: 'utf8',
          group: 'pupil', grade: 'junior', check_type: 'common', rst: 'entirety', ise_unite: '1',
          extra_ability: 'multi_dimension;syll_phone_err_msg',
        }, data: { status: 0 } }));
        const send = (): void => {
          if (finished) return;
          try {
            const chunk = audio.subarray(offset, offset + 1280);
            const last = offset + 1280 >= audio.length;
            ws.send(JSON.stringify({ business: { cmd: 'auw', aus: last ? 4 : offset === 0 ? 1 : 2 },
              data: { status: last ? 2 : 1, data: chunk.toString('base64') } }));
            offset += chunk.length;
            if (!last) timer = setTimeout(send, 40);
          } catch {
            finish(new Error('音频发送失败，请重试。'));
          }
        };
        send();
      });
    });
  }
}
