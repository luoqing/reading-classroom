import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, eq, ne } from 'drizzle-orm';
import { lesson, lessonPage } from '@server/database/schema';
import type {
  IllustrationGenerateRequest,
  IllustrationGenerateResult,
  IllustrationStyle,
  LessonCatalog,
  LessonDraftInput,
  LessonRecognitionRequest,
  LessonRecognitionResult,
  LessonView,
  PinyinToken,
} from '@shared/api.interface';
import { signedStoredFileUrl, signedStorageObjectUrl } from '@server/common/storage-url';

const PINYIN_FONT_BUCKET_ID = 'bucket_aadk2myxensps';
const PINYIN_FONT_FILE_PATH = '1879663708213499.ttf';
const ARK_RESPONSES_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_OCR_MODEL = 'ep-20260502164425-7tq6j';
const DEFAULT_IMAGE_MODEL = 'doubao-seedream-5-0-lite-260128';
const ILLUSTRATION_STYLES: Record<IllustrationStyle, string> = {
  watercolor: '清新透明的水彩插画，柔和晕染与纸张肌理',
  storybook: '温暖细腻的儿童绘本插画，柔和色彩与手绘笔触',
  chinese: '适合儿童阅读的中国风插画，淡彩水墨与东方构图',
  cartoon: '明快亲切的卡通插画，简洁线条与鲜明色块',
};

type StoredPagePinyin = PinyinToken[] | {
  tokens?: PinyinToken[];
  scenePrompt?: string;
  illustrationStyle?: IllustrationStyle;
};

interface RecognizedParagraph {
  text?: string;
  pinyin?: PinyinToken[];
  scenes?: Array<{ text?: string; scenePrompt?: string }>;
}

interface ArkRecognitionPayload {
  title?: string;
  gradeLabel?: string;
  paragraphs?: RecognizedParagraph[];
  reviewNotes?: string[];
  rubric?: LessonDraftInput['rubric'];
}

@Injectable()
export class LessonsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
  ) {}

  private pagePinyin(value: unknown) {
    if (Array.isArray(value)) return { tokens: value as PinyinToken[], scenePrompt: '', illustrationStyle: 'watercolor' as IllustrationStyle };
    const stored = value as StoredPagePinyin | null;
    return {
      tokens: stored && !Array.isArray(stored) && Array.isArray(stored.tokens)
        ? stored.tokens
        : [],
      scenePrompt: stored && !Array.isArray(stored) && typeof stored.scenePrompt === 'string'
        ? stored.scenePrompt
        : '',
      illustrationStyle: stored && !Array.isArray(stored) && stored.illustrationStyle && ILLUSTRATION_STYLES[stored.illustrationStyle]
        ? stored.illustrationStyle
        : 'watercolor',
    };
  }

  private arkKey() {
    const key = this.arkSetting('ARK_API_KEY');
    if (!key) throw new BadRequestException('AI 课文录入尚未配置，请联系管理员');
    return key;
  }

  private arkSetting(name: 'ARK_API_KEY' | 'ARK_OCR_MODEL_ID' | 'ARK_IMAGE_MODEL_ID') {
    return process.env[name]?.trim().replace(/(?:\\[nr])+$/gu, '').trim();
  }

  private async arkRequest(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.arkKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new BadGatewayException(`AI 服务暂时不可用（${response.status}）`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  private responseText(payload: Record<string, unknown>) {
    if (typeof payload.output_text === 'string') return payload.output_text;
    const output = Array.isArray(payload.output) ? payload.output : [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = Array.isArray((item as { content?: unknown }).content)
        ? (item as { content: unknown[] }).content
        : [];
      for (const part of content) {
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
      }
    }
    throw new BadGatewayException('AI 没有返回可用的识别结果');
  }

  private jsonFromText(text: string) {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
    try {
      return JSON.parse(cleaned) as ArkRecognitionPayload;
    } catch {
      throw new BadGatewayException('AI 识别结果格式不正确，请重新识别');
    }
  }

  private slugFromTitle(title: string) {
    const normalized = title.trim().toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
      .replace(/^-+|-+$/gu, '');
    return `${normalized || 'lesson'}-${Date.now().toString(36)}`.slice(0, 80);
  }

  async recognize(input: LessonRecognitionRequest): Promise<LessonRecognitionResult> {
    if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > 8) {
      throw new BadRequestException('请上传 1–8 张课文图片');
    }
    const imageParts = input.images.map(image => {
      if (!/^data:image\/(?:png|jpe?g|webp);base64,/u.test(image.dataUrl || '')) {
        throw new BadRequestException('课文图片格式不支持');
      }
      return { type: 'input_image', image_url: image.dataUrl };
    });
    const prompt = `你是一名小学语文教材编辑。请识别图片中的课文，严格返回 JSON，不要返回 Markdown。\n
JSON 结构：{"title":"课文标题","gradeLabel":"年级册次，可为空","paragraphs":[{"text":"一个完整自然段","pinyin":[{"text":"单个汉字或标点","pinyin":"带声调拼音；标点为空字符串","needsReview":true}],"scenes":[{"text":"适合一幅插画的原文，可包含一句或语义完整的相邻短句","scenePrompt":"只描述人物、动作、场景和氛围，不指定画风，不含文字或字幕"}]}],"reviewNotes":["需要老师核对的内容"],"rubric":{"natural":{"kind":"fluency","description":"读流利的具体要求","neutralTargets":["含轻声的原文词组"]},"accuracyTargets":[{"char":"重点字","reading":"拼音"}],"delivery":{"description":"多音字和变调等读准确要求","pronunciationTargets":[{"char":"要检查的多音字","phrase":"该字所在的原文词组","reading":"这个字在词组中的带调拼音","tone":2}]}}}\n
要求：只识别课文标题和正文，忽略页码、插图旁孤立的生字、栏目名、“读一读”等学习提示，也不要把标题重复写进正文；保留正文原有自然段和标点；逐字给出拼音；多音字、轻声、“一/不”变调标 needsReview=true；“一”在四声前通常标 yí，在一二三声前通常标 yì，单独或序数语义时才标 yī；先按自然段、标点和语义分镜，不要机械地每逗号一张图；教学重点只有“读流利”和“读准确”两个维度，其中读准确检查重点字音节和声调、轻声字、多音字及变调；多音字不能只返回单个字，必须用 pronunciationTargets 按“字 + 原文词组 + 目标读音”逐条返回，同一个字在不同词组中出现时分别返回，例如“一片片 / yí”“一群 / yì”“一个 / yí”。`;
    const payload = await this.arkRequest(ARK_RESPONSES_URL, {
      model: this.arkSetting('ARK_OCR_MODEL_ID') || DEFAULT_OCR_MODEL,
      thinking: { type: 'disabled' },
      text: { format: { type: 'json_object' } },
      max_output_tokens: Math.min(16000, 6000 + (input.images.length - 1) * 1400),
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: prompt }, ...imageParts],
      }],
    });
    const result = this.jsonFromText(this.responseText(payload));
    const paragraphs = Array.isArray(result.paragraphs)
      ? result.paragraphs.filter(item => item?.text?.trim())
      : [];
    if (!result.title?.trim() || !paragraphs.length) {
      throw new BadGatewayException('没有识别到完整课文，请换一张清晰照片重试');
    }
    const pages: LessonDraftInput['pages'] = [];
    for (const paragraph of paragraphs) {
      const paragraphText = paragraph.text!.trim();
      const scenes = Array.isArray(paragraph.scenes) && paragraph.scenes.length
        ? paragraph.scenes
        : [{ text: paragraphText, scenePrompt: `表现“${paragraphText}”的场景` }];
      let searchFrom = 0;
      for (const scene of scenes) {
        const text = scene.text?.trim() || paragraphText;
        const paragraphTokens = Array.isArray(paragraph.pinyin) ? paragraph.pinyin : [];
        const start = paragraphText.indexOf(text, searchFrom);
        const textLength = [...text].length;
        const tokens = start >= 0 && paragraphTokens.length >= start + textLength
          ? paragraphTokens.slice(start, start + textLength)
          : paragraphTokens;
        if (start >= 0) searchFrom = start + text.length;
        pages.push({
          pageNo: pages.length + 1,
          pageType: 'body',
          text,
          pinyin: tokens.length ? tokens : paragraphTokens,
          scenePrompt: scene.scenePrompt?.trim() || `表现“${text}”的场景`,
          illustrationStyle: 'watercolor',
          illustrationUrl: null,
        });
      }
    }
    const fullText = paragraphs.map(item => item.text!.trim()).join('\n');
    return {
      slug: this.slugFromTitle(result.title),
      title: result.title.trim(),
      gradeLabel: result.gradeLabel?.trim() || null,
      fullText,
      pinyin: {
        paragraphs: paragraphs.map(item => (item.pinyin || [])
          .map(token => token.pinyin || token.text)
          .join(' ')),
      },
      rubric: {
        natural: {
          kind: 'fluency',
          description: result.rubric?.natural?.description
            || '自然段之间有合适的停顿，句子读得完整、连贯。',
          neutralTargets: result.rubric?.natural?.neutralTargets || [],
        },
        accuracyTargets: result.rubric?.accuracyTargets || [],
        delivery: result.rubric?.delivery || {},
        thresholds: result.rubric?.thresholds || {
          normalPhoneLevel: 3,
          targetPhoneLevel: 3,
        },
      },
      status: 'draft',
      pages,
      reviewNotes: [
        ...(result.reviewNotes || []),
        '请老师重点核对多音字、轻声以及“一/不”的变调，确认后再发布。',
      ],
    };
  }

  async generateIllustration(input: IllustrationGenerateRequest): Promise<IllustrationGenerateResult> {
    if (!input.text?.trim() || !input.scenePrompt?.trim()) {
      throw new BadRequestException('请先填写分镜原文和画面描述');
    }
    const style = ILLUSTRATION_STYLES[input.illustrationStyle || 'watercolor'] || ILLUSTRATION_STYLES.watercolor;
    const prompt = `为小学一年级语文课文《${input.lessonTitle}》绘制第 ${input.pageNo} 幅插画。画面内容：${input.scenePrompt}。最终画风严格采用${style}；场景描述中的其他画风词不生效。儿童友好，4:3 横版，人物与场景风格统一，画面中不要出现任何文字、拼音、字幕、水印或边框。`;
    const generated = await this.arkRequest(ARK_IMAGES_URL, {
      model: this.arkSetting('ARK_IMAGE_MODEL_ID') || DEFAULT_IMAGE_MODEL,
      prompt,
      size: '2304x1728',
      response_format: 'url',
      watermark: false,
    });
    const data = Array.isArray(generated.data) ? generated.data : [];
    const remoteUrl = data[0] && typeof data[0] === 'object'
      ? (data[0] as { url?: string }).url
      : undefined;
    if (!remoteUrl) throw new BadGatewayException('AI 没有返回插画');
    const imageResponse = await fetch(remoteUrl);
    if (!imageResponse.ok) throw new BadGatewayException('生成的插画下载失败');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const bucketId = await this.files.getDefaultBucket();
    const fileName = `lesson-${Date.now()}-${input.pageNo}.png`;
    const uploaded = await this.files.from(bucketId).upload(buffer, {
      filePath: `lessons/illustrations/${fileName}`,
      fileName,
      contentType: imageResponse.headers.get('content-type') || 'image/png',
      upsert: false,
    });
    const storageUrl = `/runtime/api/v1/storage/object/${uploaded.bucketID}/${uploaded.filePath}`;
    const previewUrl = await signedStorageObjectUrl(this.files, storageUrl);
    return {
      illustrationUrl: storageUrl,
      previewUrl: previewUrl || storageUrl,
    };
  }

  async saveDraft(input: LessonDraftInput): Promise<LessonView> {
    const slug = input.slug?.trim().toLowerCase();
    const title = input.title?.trim();
    if (!slug || !/^[a-z0-9\u4e00-\u9fff-]{2,80}$/u.test(slug) || !title || !input.fullText?.trim()) {
      throw new BadRequestException('请填写课文标题、标识和正文');
    }
    if (!Array.isArray(input.pages) || !input.pages.length) {
      throw new BadRequestException('请至少保留一个课文分镜');
    }
    const pronunciationTargets = input.rubric?.delivery?.pronunciationTargets || [];
    if (pronunciationTargets.some(target => (
      !target.char?.trim()
      || !target.phrase?.trim()
      || !target.reading?.trim()
      || !target.phrase.includes(target.char)
    ))) {
      throw new BadRequestException('请完整填写多音字、所在词组和目标读音，且词组中要包含该字');
    }
    const duplicateWhere = input.id
      ? and(eq(lesson.slug, slug), ne(lesson.id, input.id))
      : eq(lesson.slug, slug);
    const [duplicate] = await this.db.select({ id: lesson.id }).from(lesson)
      .where(duplicateWhere).limit(1);
    if (duplicate) throw new ConflictException('课文标识已存在，请换一个');
    const record = {
      slug,
      title,
      gradeLabel: input.gradeLabel?.trim() || null,
      fullText: input.fullText.trim(),
      pinyinJson: input.pinyin,
      rubricJson: input.rubric,
      status: input.status,
      coverUrl: input.pages.find(page => page.illustrationUrl)?.illustrationUrl || null,
      updatedAt: new Date(),
    };
    let lessonId = input.id;
    if (lessonId) {
      const [updated] = await this.db.update(lesson).set(record)
        .where(eq(lesson.id, lessonId)).returning({ id: lesson.id });
      if (!updated) throw new NotFoundException('课文不存在');
      await this.db.delete(lessonPage).where(eq(lessonPage.lessonId, lessonId));
    } else {
      const [created] = await this.db.insert(lesson).values(record).returning({ id: lesson.id });
      lessonId = created.id;
    }
    await this.db.insert(lessonPage).values(input.pages.map((page, index) => ({
      lessonId: lessonId!,
      pageNo: index + 1,
      pageType: page.pageType || 'body',
      textContent: page.text.trim(),
      pinyinJson: { tokens: page.pinyin || [], scenePrompt: page.scenePrompt || '', illustrationStyle: page.illustrationStyle || 'watercolor' },
      illustrationUrl: page.illustrationUrl || null,
    })));
    return this.getById(lessonId);
  }

  async getById(id: string): Promise<LessonView> {
    const [item] = await this.db.select().from(lesson).where(eq(lesson.id, id)).limit(1);
    if (!item) throw new NotFoundException('课文不存在');
    return this.lessonView(item);
  }

  private async lessonView(item: typeof lesson.$inferSelect): Promise<LessonView> {
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
      pages: await Promise.all(pages.map(async page => {
        const storedPinyin = this.pagePinyin(page.pinyinJson);
        return {
          id: page.id,
          pageNo: page.pageNo,
          pageType: page.pageType,
          text: page.textContent,
          pinyin: storedPinyin.tokens,
          scenePrompt: storedPinyin.scenePrompt,
          illustrationStyle: storedPinyin.illustrationStyle,
          illustrationStorageUrl: page.illustrationUrl,
          illustrationUrl: await signedStorageObjectUrl(this.files, page.illustrationUrl),
          demoAudioUrl: await signedStorageObjectUrl(this.files, page.demoAudioUrl),
          videoStartMs: page.videoStartMs,
          videoEndMs: page.videoEndMs,
        };
      })),
    };
  }

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
    return this.lessonView(item);
  }
}
