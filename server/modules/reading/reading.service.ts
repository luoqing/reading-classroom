import WebSocket from 'ws';
import { BadGatewayException, BadRequestException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import type { EvaluationReportRequest, ReadingHistoryItem, ReadingRequest, ReadingResult } from '../../../shared/api.interface';
import { lesson, lessonPage, readingAttempt, readingClip, readingEvaluation, studentLessonProgress } from '@server/database/schema';
import { signedStoredFileUrl } from '@server/common/storage-url';

interface ProviderResult { xml: string; sid?: string }

@Injectable()
export class ReadingService {
  private active = 0;
  private started: number[] = [];

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
  ) {}

  configured(): boolean {
    return Boolean(process.env.XFYUN_APP_ID && process.env.XFYUN_API_KEY && process.env.XFYUN_API_SECRET);
  }

  async evaluate(input: ReadingRequest, studentId: string): Promise<ReadingResult> {
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
    if (!this.configured()) throw new ServiceUnavailableException('老师尚未配置讯飞服务。');
    const now = Date.now();
    this.started = this.started.filter((time: number) => now - time < 3600000);
    // Per-instance guard: not a global billing cap across platform replicas/restarts.
    if (this.active >= 2 || this.started.length >= 60) {
      throw new HttpException('当前练习较多，请稍后再提交。录音已保留。', 429);
    }
    this.active++;
    this.started.push(now);
    try {
      const provider = await this.callProvider(input.text, audio);
      const [evaluation] = await this.db.insert(readingEvaluation).values({
        attemptId: attempt.id,
        providerSid: provider.sid,
        algorithmVersion: 'xfyun-common-v2-three-dimension-20261017',
        rawXml: provider.xml,
      }).returning();
      await this.db.update(readingAttempt).set({ status: 'evaluated', updatedAt: new Date() })
        .where(eq(readingAttempt.id, attempt.id));
      await this.db.update(studentLessonProgress).set({
        latestEvaluationId: evaluation.id,
        updatedAt: new Date(),
      }).where(and(
        eq(studentLessonProgress.studentId, studentId),
        eq(studentLessonProgress.lessonId, lessonRecord.id),
      ));
      return { attemptId: attempt.id, evaluationId: evaluation.id, xml: provider.xml, sid: provider.sid };
    } catch (error) {
      await this.db.update(readingAttempt).set({ status: 'evaluation_failed', updatedAt: new Date() })
        .where(eq(readingAttempt.id, attempt.id));
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(error instanceof Error ? error.message : '讯飞评测失败，请重试。');
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
      .orderBy(desc(readingAttempt.recordedAt));
    return Promise.all(rows.map(async row => ({
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

  private callProvider(text: string, audio: Buffer): Promise<ProviderResult> {
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
            else finish(undefined, { xml: Buffer.from(data.data.data, 'base64').toString('utf8'), sid: data.sid });
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
