import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { asc, eq } from 'drizzle-orm';
import { lesson, lessonPage } from '@server/database/schema';
import type { LessonCatalog, LessonView } from '@shared/api.interface';
import { signedStoredFileUrl, signedStorageObjectUrl } from '@server/common/storage-url';

const PINYIN_FONT_BUCKET_ID = 'bucket_aadk2myxensps';
const PINYIN_FONT_FILE_PATH = '1879663708213499.ttf';

@Injectable()
export class LessonsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
  ) {}

  async list() {
    const rows = await this.db.select().from(lesson)
      .where(eq(lesson.status, 'published'))
      .orderBy(asc(lesson.title));
    return Promise.all(rows.map(async row => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      gradeLabel: row.gradeLabel,
      revision: row.revision,
      coverUrl: await signedStorageObjectUrl(this.files, row.coverUrl),
    })));
  }

  async catalog(): Promise<LessonCatalog> {
    const [items, pinyinFontUrl] = await Promise.all([
      this.list(),
      signedStoredFileUrl(this.files, PINYIN_FONT_BUCKET_ID, PINYIN_FONT_FILE_PATH),
    ]);
    return { items, pinyinFontUrl };
  }

  async getBySlug(slug: string): Promise<LessonView> {
    const [item] = await this.db.select().from(lesson)
      .where(eq(lesson.slug, slug)).limit(1);
    if (!item || item.status !== 'published') throw new NotFoundException('课文不存在');
    const pages = await this.db.select().from(lessonPage)
      .where(eq(lessonPage.lessonId, item.id)).orderBy(asc(lessonPage.pageNo));
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      gradeLabel: item.gradeLabel,
      fullText: item.fullText,
      pinyin: item.pinyinJson as { paragraphs: string[] },
      rubric: item.rubricJson as LessonView['rubric'],
      revision: item.revision,
      coverUrl: await signedStorageObjectUrl(this.files, item.coverUrl),
      fullDemoUrl: await signedStorageObjectUrl(this.files, item.fullDemoUrl),
      videoTemplateUrl: await signedStorageObjectUrl(this.files, item.videoTemplateUrl),
      pages: await Promise.all(pages.map(async page => ({
        id: page.id,
        pageNo: page.pageNo,
        pageType: page.pageType,
        text: page.textContent,
        pinyin: page.pinyinJson as { text: string; pinyin: string }[],
        illustrationUrl: await signedStorageObjectUrl(this.files, page.illustrationUrl),
        demoAudioUrl: await signedStorageObjectUrl(this.files, page.demoAudioUrl),
        videoStartMs: page.videoStartMs,
        videoEndMs: page.videoEndMs,
      }))),
    };
  }
}
