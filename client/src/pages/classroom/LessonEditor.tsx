import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  Check,
  BookOpen,
  AudioLines,
  ChartNoAxesCombined,
  FileText,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  Merge,
  Plus,
  PencilLine,
  Save,
  Scissors,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminLessonSummary,
  LessonDraftInput,
  LessonDraftPageInput,
  LessonRecognitionImage,
  PinyinToken,
} from '@shared/api.interface';
import {
  generateLessonIllustration,
  recognizeLesson,
  saveLesson,
} from '../../api/classroom';
import { Button } from '../../components/ui/button';
import { Image } from '../../components/ui/image';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import ReadingCottageMark from './ReadingCottageMark';

interface LessonEditorProps {
  lesson?: AdminLessonSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const EMPTY_DRAFT: LessonDraftInput = {
  slug: '',
  title: '',
  gradeLabel: '一年级上册',
  fullText: '',
  pinyin: { paragraphs: [] },
  rubric: {
    natural: {
      kind: 'fluency',
      description: '自然段之间有合适的停顿，句子读得完整、连贯。',
      neutralTargets: [],
    },
    accuracyTargets: [],
    delivery: { description: '', pronunciationTargets: [] },
    thresholds: { normalPhoneLevel: 3, targetPhoneLevel: 3 },
  },
  status: 'draft',
  pages: [],
};

function lessonToDraft(lesson?: AdminLessonSummary | null): LessonDraftInput {
  if (!lesson) return structuredClone(EMPTY_DRAFT);
  const delivery = lesson.rubric.delivery || {};
  const legacyTargets = delivery.yiTargets || [];
  const pronunciationTargets = delivery.pronunciationTargets?.length
    ? delivery.pronunciationTargets
    : legacyTargets.map(target => ({
      char: '一',
      phrase: target.label.replace(/^第[一二三四五六七八九十]+处/u, '').replace(/[“”]/gu, ''),
      reading: target.reading,
      tone: target.tone,
    }));
  const neutralTargets = lesson.rubric.natural?.neutralTargets?.length
    ? lesson.rubric.natural.neutralTargets
    : delivery.neutralTargets || [];
  const legacyDescriptions = new Set([
    '断句和节奏自然，标点处合理停顿',
    '按逗号和句号自然停顿，问句读出疑问语气',
  ]);
  const naturalDescription = legacyDescriptions.has(lesson.rubric.natural?.description || '')
    ? '自然段之间有合适的停顿，句子读得完整、连贯。'
    : lesson.rubric.natural?.description || EMPTY_DRAFT.rubric.natural?.description;
  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    gradeLabel: lesson.gradeLabel,
    fullText: lesson.fullText,
    pinyin: lesson.pinyin,
    rubric: {
      ...lesson.rubric,
      natural: {
        ...lesson.rubric.natural,
        kind: 'fluency',
        description: naturalDescription,
        neutralTargets,
      },
      delivery: {
        ...delivery,
        neutralTargets: undefined,
        yiTargets: undefined,
        pronunciationTargets,
      },
    },
    status: lesson.status === 'published' ? 'published' : 'draft',
    pages: lesson.pages.map((page, index) => ({
      id: page.id,
      pageNo: index + 1,
      pageType: page.pageType === 'cover' ? 'cover' : 'body',
      text: page.text,
      pinyin: page.pinyin,
      scenePrompt: page.scenePrompt || `表现“${page.text}”的儿童水彩绘本插画`,
      illustrationUrl: page.illustrationStorageUrl || page.illustrationUrl,
      illustrationPreviewUrl: page.illustrationUrl,
    })),
  };
}

const VOWELS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

function normalizePinyin(value: string) {
  const normalized = value.trim().toLowerCase().replace(/v/gu, 'ü');
  const match = normalized.match(/^([a-zü]+)([1-5])$/u);
  if (!match || match[2] === '5') return match ? match[1] : normalized;
  const syllable = match[1];
  const tone = Number(match[2]) - 1;
  let index = syllable.search(/[aeo]/u);
  if (index < 0) {
    const iu = syllable.match(/iu|ui/u);
    index = iu?.index !== undefined ? iu.index + 1 : Math.max(
      syllable.lastIndexOf('i'),
      syllable.lastIndexOf('u'),
      syllable.lastIndexOf('ü'),
    );
  }
  if (index < 0) return normalized;
  const vowel = syllable[index];
  return `${syllable.slice(0, index)}${VOWELS[vowel]?.[tone] || vowel}${syllable.slice(index + 1)}`;
}

const reindexPages = (pages: LessonDraftPageInput[]) => pages.map((page, index) => ({
  ...page,
  pageNo: index + 1,
}));

async function fileToImage(file: File): Promise<LessonRecognitionImage> {
  if (file.size > 600 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return { name: file.name, dataUrl: canvas.toDataURL('image/jpeg', .85) };
    } catch {
      // Keep the original photo when this browser cannot decode it for compression.
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function LessonEditor({ lesson, onClose, onSaved }: LessonEditorProps) {
  const [draft, setDraft] = useState<LessonDraftInput>(() => lessonToDraft(lesson));
  const [step, setStep] = useState(lesson ? 1 : 0);
  const [furthestStep, setFurthestStep] = useState(lesson ? 1 : 0);
  const [photos, setPhotos] = useState<LessonRecognitionImage[]>([]);
  const [photoPage, setPhotoPage] = useState(0);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [illustrationErrors, setIllustrationErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const keyTargets = useMemo(() => (draft.rubric.accuracyTargets || [])
    .map(item => `${item.char}=${item.reading}`).join('、'), [draft.rubric.accuracyTargets]);
  const neutralTargets = useMemo(() => (draft.rubric.natural?.neutralTargets || []).join('、'), [draft.rubric.natural?.neutralTargets]);
  const pronunciationTargets = draft.rubric.delivery?.pronunciationTargets || [];
  const completedIllustrations = draft.pages.filter(page => page.illustrationUrl).length;
  const steps = ['上传照片', '校对课文', '教学重点', '分镜插画', '确认发布'];
  const goToStep = (next: number) => {
    setStep(next);
    setFurthestStep(current => Math.max(current, next));
    setMessage('');
    document.querySelector('.lesson-editor-backdrop')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const nextStep = () => {
    if (step === 1 && (!draft.title.trim() || !draft.fullText.trim() || !draft.slug.trim())) {
      setMessage('请先确认课文标题、标识和正文，再继续');
      return;
    }
    goToStep(step + 1);
  };

  const updatePage = (index: number, patch: Partial<LessonDraftPageInput>) => {
    setDraft(current => ({
      ...current,
      pages: current.pages.map((page, pageIndex) => {
        if (pageIndex !== index) return page;
        const contentChanged = (patch.text !== undefined && patch.text !== page.text)
          || (patch.scenePrompt !== undefined && patch.scenePrompt !== page.scenePrompt);
        return { ...page, ...(contentChanged ? { illustrationUrl: null, illustrationPreviewUrl: null } : {}), ...patch };
      }),
    }));
    if (patch.text !== undefined || patch.scenePrompt !== undefined) {
      setIllustrationErrors(current => ({ ...current, [index]: '' }));
    }
  };

  const selectPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = [...files];
    if (photos.length + selected.length > 8) {
      setMessage('最多上传 8 张照片，请先移除不需要的页面');
      return;
    }
    if (selected.some(file => file.size > 10 * 1024 * 1024)) {
      setMessage('单张图片不能超过 10MB');
      return;
    }
    try {
      const images = await Promise.all(selected.map(fileToImage));
      setPhotos(current => [...current, ...images]);
      setMessage('图片已选好，可以开始 AI 识别');
    } catch {
      setMessage('图片读取失败，请重新选择');
    }
  };

  const runRecognition = async () => {
    if (!photos.length) return;
    setRecognizing(true);
    setMessage('AI 正在识别正文、逐字拼音和分镜建议…');
    try {
      const result = await recognizeLesson({ images: photos });
      const { reviewNotes: notes, ...recognizedDraft } = result;
      setDraft(recognizedDraft);
      setReviewNotes(notes);
      goToStep(1);
      setMessage('识别完成。请先校对正文和橙色拼音。');
    } catch {
      setMessage('识别失败，请检查照片清晰度后重试');
    } finally {
      setRecognizing(false);
    }
  };

  const updateToken = (pageIndex: number, tokenIndex: number, patch: Partial<PinyinToken>) => {
    const tokens = draft.pages[pageIndex].pinyin.map((token, index) => (
      index === tokenIndex ? { ...token, ...patch } : token
    ));
    updatePage(pageIndex, { pinyin: tokens });
  };

  const splitPage = (index: number) => {
    const page = draft.pages[index];
    const punctuationIndex = [...page.text].findIndex((char, charIndex) => (
      charIndex > 0 && /[。！？；]/u.test(char) && charIndex < [...page.text].length - 1
    ));
    const splitAt = punctuationIndex >= 0 ? punctuationIndex + 1 : Math.ceil([...page.text].length / 2);
    const chars = [...page.text];
    const firstText = chars.slice(0, splitAt).join('').trim();
    const secondText = chars.slice(splitAt).join('').trim();
    if (!firstText || !secondText) {
      setMessage('这条分镜太短，建议先在原文中补充标点后再拆分');
      return;
    }
    const first: LessonDraftPageInput = {
      ...page,
      text: firstText,
      pinyin: page.pinyin.slice(0, splitAt),
      scenePrompt: `表现“${firstText}”的儿童水彩绘本插画`,
      illustrationUrl: null,
      illustrationPreviewUrl: null,
    };
    const second: LessonDraftPageInput = {
      ...page,
      id: undefined,
      text: secondText,
      pinyin: page.pinyin.slice(splitAt),
      scenePrompt: `表现“${secondText}”的儿童水彩绘本插画`,
      illustrationUrl: null,
      illustrationPreviewUrl: null,
    };
    setDraft(current => ({
      ...current,
      pages: reindexPages([
        ...current.pages.slice(0, index),
        first,
        second,
        ...current.pages.slice(index + 1),
      ]),
    }));
    setIllustrationErrors({});
  };

  const mergeNext = (index: number) => {
    const current = draft.pages[index];
    const next = draft.pages[index + 1];
    if (!next) return;
    const merged: LessonDraftPageInput = {
      ...current,
      text: `${current.text}${next.text}`,
      pinyin: [...current.pinyin, ...next.pinyin],
      scenePrompt: `${current.scenePrompt}；${next.scenePrompt}`,
      illustrationUrl: null,
      illustrationPreviewUrl: null,
    };
    setDraft(value => ({
      ...value,
      pages: reindexPages([
        ...value.pages.slice(0, index),
        merged,
        ...value.pages.slice(index + 2),
      ]),
    }));
    setIllustrationErrors({});
  };

  const addPage = () => {
    setDraft(current => ({
      ...current,
      pages: reindexPages([...current.pages, {
        pageNo: current.pages.length + 1,
        pageType: 'body',
        text: '',
        pinyin: [],
        scenePrompt: '',
        illustrationUrl: null,
        illustrationPreviewUrl: null,
      }]),
    }));
    setIllustrationErrors({});
  };

  const generateOne = async (index: number): Promise<boolean> => {
    const page = draft.pages[index];
    if (!page.text.trim() || !page.scenePrompt.trim()) {
      setIllustrationErrors(current => ({ ...current, [index]: '请先填写原文和画面描述' }));
      return false;
    }
    setGenerating(current => new Set(current).add(index));
    setIllustrationErrors(current => ({ ...current, [index]: '' }));
    try {
      const result = await generateLessonIllustration({
        lessonTitle: draft.title,
        pageNo: index + 1,
        text: page.text,
        scenePrompt: page.scenePrompt,
      });
      updatePage(index, {
        illustrationUrl: result.illustrationUrl,
        illustrationPreviewUrl: result.previewUrl,
      });
      return true;
    } catch (error) {
      const serverMessage = isAxiosError(error) ? error.response?.data?.message : undefined;
      const detail = typeof serverMessage === 'string' ? serverMessage : '请检查网络后重试';
      setIllustrationErrors(current => ({ ...current, [index]: detail }));
      return false;
    } finally {
      setGenerating(current => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
    }
  };

  const generateAll = async () => {
    const indexes = draft.pages.map((_, index) => index)
      .filter(index => !draft.pages[index].illustrationUrl);
    let failed = 0;
    for (const index of indexes) {
      if (!await generateOne(index)) failed += 1;
    }
    setMessage(failed ? `${failed} 张插画未生成，请查看对应卡片并重试` : '插画已生成完成，可以继续确认发布');
  };

  const save = async (status: 'draft' | 'published', closeOnSuccess = status === 'published') => {
    setSaving(true);
    setMessage(status === 'published' ? '正在发布课文…' : '正在保存草稿…');
    try {
      const saved = await saveLesson({ ...draft, status });
      setDraft(current => ({ ...current, id: saved.id, status }));
      setMessage(status === 'published' ? '课文已发布，学生端可以看到' : '草稿已保存');
      await onSaved();
      if (closeOnSuccess) onClose();
    } catch {
      setMessage('保存失败，请检查标题、课文标识和分镜内容');
    } finally {
      setSaving(false);
    }
  };

  const setAccuracyTargets = (value: string) => {
    const accuracyTargets = value.split(/[、,，\n]/u).map(item => item.trim()).filter(Boolean)
      .map(item => {
        const [char, reading = ''] = item.split(/[=＝\s]/u).map(part => part.trim());
        return { char, reading };
      });
    setDraft(current => ({ ...current, rubric: { ...current.rubric, accuracyTargets } }));
  };

  const updatePronunciationTarget = (
    index: number,
    patch: Partial<{ char: string; phrase: string; reading: string; tone?: number }>,
  ) => {
    setDraft(current => ({
      ...current,
      rubric: {
        ...current.rubric,
        delivery: {
          ...current.rubric.delivery,
          yiTargets: undefined,
          pronunciationTargets: (current.rubric.delivery?.pronunciationTargets || [])
            .map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target),
        },
      },
    }));
  };

  const addPronunciationTarget = () => setDraft(current => ({
    ...current,
    rubric: {
      ...current.rubric,
      delivery: {
        ...current.rubric.delivery,
        yiTargets: undefined,
        pronunciationTargets: [
          ...(current.rubric.delivery?.pronunciationTargets || []),
          { char: '', phrase: '', reading: '' },
        ],
      },
    },
  }));

  const removePronunciationTarget = (index: number) => setDraft(current => ({
    ...current,
    rubric: {
      ...current.rubric,
      delivery: {
        ...current.rubric.delivery,
        yiTargets: undefined,
        pronunciationTargets: (current.rubric.delivery?.pronunciationTargets || [])
          .filter((_, targetIndex) => targetIndex !== index),
      },
    },
  }));

  return <div className="lesson-editor-backdrop"><div className="lesson-editor-shell">
    <aside className="lesson-editor-sidebar" aria-label="教师工作台">
      <div className="lesson-editor-brand"><ReadingCottageMark /><strong>朗读小屋</strong><span>让每一篇课文，<br />都读进孩子的心里</span></div>
      <nav aria-label="工作台导航"><span><FileText />我的课文</span><span className="current"><PencilLine />录入新课文</span><span><BookOpen />我的资源</span><span><Users />班级管理</span><span><ChartNoAxesCombined />学情观察</span></nav>
      <div className="lesson-editor-sidebar-art"><p>在文字的阳光下，<br />看见更大的世界。</p></div>
    </aside>
    <section className="lesson-editor" aria-label="AI 课文录入">
      <header className="lesson-editor-header">
        <div><span className="teacher-kicker">朗读小屋 · 课文工作台</span><h2>{lesson ? `编辑《${lesson.title}》` : '录入新课文'}</h2><p>每一步只完成一件事，随时可以保存当前进度。</p></div>
        <button className="drawer-close" onClick={onClose} aria-label="关闭课文编辑"><X /></button>
      </header>

      <nav className="lesson-editor-steps" aria-label="录入流程">{steps.map((name, index) => <button key={name} type="button" className={index === step ? 'active' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined} disabled={index > furthestStep || (index === 0 && !!lesson)} onClick={() => goToStep(index)}><b>{index < step ? <Check size={16} /> : index + 1}</b><span><strong>{name}</strong><small>{['拍照或上传课本页面', '识别并校对文字内容', '设置本课的教学目标', '为每一段准备画面', '预览并发布课文'][index]}</small></span></button>)}</nav>

      {step === 0 && !lesson && <section className="lesson-editor-card photo-import-card">
        <div className="photo-import-intro"><span className="lesson-section-index">STEP 01 / 准备素材</span><h3>先拍下课文书页</h3><p>按课文顺序上传 1–8 张清晰照片，识别后可以修改。</p></div>
        <div className="photo-import-main"><label className="photo-picker"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { void selectPhotos(event.target.files); event.target.value = ''; }} /><span className="photo-picker-icon"><Upload /></span><strong>{photos.length ? '继续添加课文照片' : '选择课文照片'}</strong><small>支持 JPG、PNG、WebP · 单张不超过 10 MB</small></label>
          {!!photos.length && <div className="photo-preview-row">{photos.map((photo, index) => <div className="photo-preview" key={`${photo.name}-${index}`}><div><Image src={photo.dataUrl} alt={`第 ${index + 1} 页：${photo.name}`} /><button type="button" aria-label={`移除第 ${index + 1} 页照片`} onClick={() => setPhotos(current => current.filter((_, photoIndex) => photoIndex !== index))}><X size={14} /></button></div><span>第 {index + 1} 页</span></div>)}</div>}
          <div className="photo-import-action"><span>老师校对确认后才会发布给学生</span><Button onClick={() => void runRecognition()} disabled={!photos.length || recognizing}>{recognizing ? <LoaderCircle className="spin" /> : <Sparkles />}{recognizing ? '正在识别课文…' : '开始识别课文'}</Button></div>
        </div>
        <aside className="photo-guide"><h4><Lightbulb />拍摄小提示</h4><div className="photo-guide-items"><div><h5><b>1</b>书页放平</h5><span className="photo-guide-image photo-guide-image-1" role="img" aria-label="平放在桌上的课本示例" /><p>将课本平放在桌面上，保持页面平整。</p></div><div><h5><b>2</b>避开反光和阴影</h5><span className="photo-guide-image photo-guide-image-2" role="img" aria-label="光线均匀的课本示例" /><p>在光线均匀的地方拍摄，避开强光反光或手部阴影。</p></div><div><h5><b>3</b>文字完整入镜</h5><span className="photo-guide-image photo-guide-image-3" role="img" aria-label="整页文字完整入镜的示例" /><p>确保整页文字和插图都完整出现在画面中。</p></div></div></aside>
      </section>}

      {message && <p className="lesson-editor-message" role="status">{message}</p>}

      {!!draft.fullText && step === 1 && <>
        <div className="lesson-proofread-heading"><div><span className="lesson-section-index">STEP 02 / 校对内容</span><h3>先核对课文，再检查拼音</h3><p>识别结果只是初稿，橙色标记需要老师重点确认。</p></div><span>已识别 {photos.length || draft.pages.length} 页 · 待核对 {draft.pages.flatMap(page => page.pinyin).filter(token => token.needsReview).length} 处</span></div>
        <div className={photos.length ? 'lesson-proofread-grid' : ''}><section className="lesson-editor-card lesson-meta-card"><div className="lesson-section-title"><div><h3>课文信息</h3><p>学生看到的内容以这里为准。</p></div></div><div className="lesson-meta-grid">
          <label>课文标题<Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
          <label>年级册次<Input value={draft.gradeLabel || ''} onChange={event => setDraft(current => ({ ...current, gradeLabel: event.target.value }))} /></label>
          <label>课文标识<Input value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: event.target.value }))} /></label>
          <label className="wide">课文正文<Textarea rows={8} value={draft.fullText} onChange={event => setDraft(current => ({ ...current, fullText: event.target.value }))} /></label>
        </div></section>{!!photos.length && <aside className="lesson-editor-card proofread-photo"><div><h3>原书照片</h3><span>第 {photoPage + 1} / {photos.length} 页</span></div><Image src={photos[photoPage]?.dataUrl || photos[0].dataUrl} alt={`第 ${photoPage + 1} 页原书照片`} /><div className="proofread-photo-actions"><button type="button" disabled={photoPage === 0} onClick={() => setPhotoPage(current => current - 1)}>上一页</button><button type="button" disabled={photoPage === photos.length - 1} onClick={() => setPhotoPage(current => current + 1)}>下一页</button></div></aside>}</div>

        {!!reviewNotes.length && <section className="lesson-review-notes"><strong>老师需要核对</strong>{reviewNotes.map(note => <p key={note}><Check />{note}</p>)}</section>}

        <section className="lesson-editor-card">
          <div className="lesson-section-title"><div><span className="lesson-section-index">STEP 02 / 校对内容</span><h3>逐字校对拼音</h3><p>橙色是多音字、轻声或变调。点拼音即可修改，输入 yi2 会自动变成 yí。</p></div></div>
          <div className="pinyin-edit-pages">{draft.pages.map((page, pageIndex) => <article key={`${page.pageNo}-${page.text}`}>
            <small>分镜 {pageIndex + 1}</small><p>{page.text}</p>
            <div className="pinyin-token-grid">{page.pinyin.map((token, tokenIndex) => <label className={token.needsReview ? 'needs-review' : ''} key={`${tokenIndex}-${token.text}`}>
              <Input value={token.pinyin} aria-label={`${token.text}的拼音`} onChange={event => updateToken(pageIndex, tokenIndex, { pinyin: event.target.value })} onBlur={event => updateToken(pageIndex, tokenIndex, { pinyin: normalizePinyin(event.target.value), needsReview: false })} />
              <span>{token.text}</span>
            </label>)}</div>
          </article>)}</div>
        </section>

      </>}

      {!!draft.fullText && step === 2 && <section className="lesson-editor-card rubric-editor">
          <div className="lesson-section-title"><div><span className="lesson-section-index">STEP 03 / 朗读目标</span><h3>这篇课文，重点练什么？</h3><p>从识别建议开始，只需确认真正要教的内容。</p></div></div>
          <div className="rubric-overview"><span><i><BookOpen /></i><span><strong>读流利</strong><small>读得顺畅，有停顿</small></span></span><span><i><Target /></i><span><strong>读准确</strong><small>读准字音，不读错</small></span></span><span><i><AudioLines /></i><span><strong>多音字与变调</strong><small>确认词组中的读音</small></span></span></div>
          <label><strong className="rubric-label"><BookOpen />读流利</strong><Textarea value={draft.rubric.natural?.description || ''} onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, natural: { ...current.rubric.natural, kind: 'fluency', description: event.target.value } } }))} /></label>
          <label><strong className="rubric-label"><Target />读准确：重点字</strong><Input value={keyTargets} placeholder="秋=qiū、气=qì" onChange={event => setAccuracyTargets(event.target.value)} /></label>
          <label><strong>读准确：轻声字词</strong><Input value={neutralTargets} placeholder="凉了、黄了、来了" onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, natural: { ...current.rubric.natural, neutralTargets: event.target.value.split(/[、,，]/u).map(item => item.trim()).filter(Boolean) } } }))} /></label>
          <div className="pronunciation-targets">
            <div className="pronunciation-targets-head"><div><strong className="rubric-label"><AudioLines />读准确：多音字与变调</strong><span>按“字 + 所在词组 + 目标读音”设置，同一个字可添加多条。</span></div><Button size="sm" variant="outline" onClick={addPronunciationTarget}><Plus />添加词组</Button></div>
            {pronunciationTargets.length ? pronunciationTargets.map((target, index) => <div className="pronunciation-target-row" key={index}>
              <label>检查哪个字<Input value={target.char} maxLength={1} placeholder="一" onChange={event => updatePronunciationTarget(index, { char: event.target.value })} /></label>
              <label>所在词组<Input value={target.phrase} placeholder="一片片" onChange={event => updatePronunciationTarget(index, { phrase: event.target.value })} /></label>
              <label>目标读音<Input value={target.reading} placeholder="yí" onChange={event => updatePronunciationTarget(index, { reading: event.target.value })} onBlur={event => updatePronunciationTarget(index, { reading: normalizePinyin(event.target.value) })} /></label>
              <Button size="sm" variant="ghost" aria-label={`删除${target.phrase || '这条'}读音规则`} onClick={() => removePronunciationTarget(index)}><Trash2 /></Button>
            </div>) : <p className="pronunciation-target-empty">还没有词组规则。比如可添加“一 / 一片片 / yí”“一 / 一群 / yì”。</p>}
            <label className="pronunciation-description">补充说明<Textarea value={draft.rubric.delivery?.description || ''} placeholder="例如：注意多音字在不同词语中的实际读音。" onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, delivery: { ...current.rubric.delivery, description: event.target.value } } }))} /></label>
            <p className="rubric-confirm-note">机器建议需要老师确认，规则会用于后续朗读评测。</p>
          </div>
        </section>}

      {!!draft.fullText && step === 3 && <section className="lesson-editor-card storyboard-editor">
          <div className="lesson-section-title"><div><span className="lesson-section-index">STEP 04 / 画面准备</span><h3>分镜与逐张插画</h3><p>AI 已按自然段、标点和句意分镜。可拆分、合并或改画面描述，再逐张生成。</p></div><Button variant="outline" onClick={addPage}><Plus />添加分镜</Button></div>
          <div className="illustration-progress"><span>已完成 <strong>{completedIllustrations} / {draft.pages.length}</strong> 幅画面</span><div><i style={{ width: `${draft.pages.length ? completedIllustrations / draft.pages.length * 100 : 0}%` }} /></div></div>
          <div className="storyboard-list">{draft.pages.map((page, index) => <article key={`scene-${index}`}>
            <div className="storyboard-number">{index + 1}</div>
            <div className="storyboard-copy">
              <label>对应原文<Textarea value={page.text} onChange={event => updatePage(index, { text: event.target.value })} /></label>
              <label>画面描述<Textarea value={page.scenePrompt} onChange={event => updatePage(index, { scenePrompt: event.target.value })} /></label>
              <div className="storyboard-actions"><Button size="sm" variant="outline" onClick={() => splitPage(index)}><Scissors />拆分</Button>{index < draft.pages.length - 1 && <Button size="sm" variant="outline" onClick={() => mergeNext(index)}><Merge />与下一条合并</Button>}<Button size="sm" variant="ghost" onClick={() => { setDraft(current => ({ ...current, pages: reindexPages(current.pages.filter((_, pageIndex) => pageIndex !== index)) })); setIllustrationErrors({}); }}><Trash2 />删除</Button></div>
            </div>
            <div className="storyboard-image"><small>插画预览</small>{page.illustrationUrl ? <img src={page.illustrationPreviewUrl || page.illustrationUrl} alt={`第${index + 1}幅插画`} onError={() => setIllustrationErrors(current => ({ ...current, [index]: '预览加载失败，请重新生成' }))} /> : <span className={illustrationErrors[index] ? 'failed' : ''}><ImagePlus />{illustrationErrors[index] ? '生成失败' : '等待生成'}</span>}{illustrationErrors[index] && <p className="illustration-error" role="alert">{illustrationErrors[index]}</p>}<Button size="sm" onClick={() => void generateOne(index)} disabled={generating.has(index)}>{generating.has(index) ? <LoaderCircle className="spin" /> : <Sparkles />}{generating.has(index) ? '正在生成…' : illustrationErrors[index] ? '重新生成' : page.illustrationUrl ? '替换插画' : '生成插画'}</Button></div>
          </article>)}</div>
          <Button onClick={() => void generateAll()} disabled={!draft.pages.length || generating.size > 0 || completedIllustrations === draft.pages.length}><Sparkles />生成剩余插画</Button>
        </section>}

      {!!draft.fullText && step === 4 && <section className="lesson-editor-card lesson-publish-card"><span className="lesson-section-index">STEP 05 / 确认发布</span><h3>最后检查一次</h3><p>发布后，学生就可以看到这篇课文并开始朗读。</p><div className="lesson-publish-summary"><div><small>课文</small><strong>{draft.title || '未填写标题'}</strong><span>{draft.gradeLabel || '未填写年级'}</span></div><div><small>分镜</small><strong>{draft.pages.length} 页</strong><span>正文与拼音已录入</span></div><div><small>插画</small><strong>{completedIllustrations} / {draft.pages.length} 幅</strong><span>{completedIllustrations === draft.pages.length ? '全部完成' : '仍有画面未生成'}</span></div></div><div className="lesson-publish-preview"><h4>学生看到的课文正文</h4><p>{draft.fullText}</p></div></section>}

      {!!draft.fullText && <footer className="lesson-editor-footer"><Button variant="outline" onClick={() => goToStep(step - 1)} disabled={step === 0 || (step === 1 && !!lesson)}>返回上一步</Button><span className="lesson-footer-spacer" /><Button variant="outline" onClick={() => void save(draft.status === 'published' ? 'published' : 'draft', false)} disabled={saving}><Save />{draft.status === 'published' ? '保存修改' : '保存草稿'}</Button>{step < 4 ? <Button onClick={nextStep}><Check />下一步：{steps[step + 1]}</Button> : <Button onClick={() => void save('published')} disabled={saving || !draft.pages.length}><Check />确认发布课文</Button>}</footer>}
    </section>
  </div></div>;
}
