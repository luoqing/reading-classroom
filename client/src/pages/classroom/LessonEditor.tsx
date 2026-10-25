import { useMemo, useState } from 'react';
import {
  Check,
  ImagePlus,
  LoaderCircle,
  Merge,
  Plus,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
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
      illustrationUrl: page.illustrationUrl,
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

function fileToImage(file: File): Promise<LessonRecognitionImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function LessonEditor({ lesson, onClose, onSaved }: LessonEditorProps) {
  const [draft, setDraft] = useState<LessonDraftInput>(() => lessonToDraft(lesson));
  const [photos, setPhotos] = useState<LessonRecognitionImage[]>([]);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const keyTargets = useMemo(() => (draft.rubric.accuracyTargets || [])
    .map(item => `${item.char}=${item.reading}`).join('、'), [draft.rubric.accuracyTargets]);
  const neutralTargets = useMemo(() => (draft.rubric.natural?.neutralTargets || []).join('、'), [draft.rubric.natural?.neutralTargets]);
  const pronunciationTargets = draft.rubric.delivery?.pronunciationTargets || [];

  const updatePage = (index: number, patch: Partial<LessonDraftPageInput>) => {
    setDraft(current => ({
      ...current,
      pages: current.pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...patch } : page),
    }));
  };

  const selectPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = [...files].slice(0, 8);
    if (selected.some(file => file.size > 10 * 1024 * 1024)) {
      setMessage('单张图片不能超过 10MB');
      return;
    }
    try {
      setPhotos(await Promise.all(selected.map(fileToImage)));
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
      setMessage('识别完成。请先校对正文和橙色拼音，再生成插画。');
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
    };
    const second: LessonDraftPageInput = {
      ...page,
      id: undefined,
      text: secondText,
      pinyin: page.pinyin.slice(splitAt),
      scenePrompt: `表现“${secondText}”的儿童水彩绘本插画`,
      illustrationUrl: null,
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
    };
    setDraft(value => ({
      ...value,
      pages: reindexPages([
        ...value.pages.slice(0, index),
        merged,
        ...value.pages.slice(index + 2),
      ]),
    }));
  };

  const addPage = () => setDraft(current => ({
    ...current,
    pages: reindexPages([...current.pages, {
      pageNo: current.pages.length + 1,
      pageType: 'body',
      text: '',
      pinyin: [],
      scenePrompt: '',
      illustrationUrl: null,
    }]),
  }));

  const generateOne = async (index: number) => {
    const page = draft.pages[index];
    setGenerating(current => new Set(current).add(index));
    try {
      const result = await generateLessonIllustration({
        lessonTitle: draft.title,
        pageNo: index + 1,
        text: page.text,
        scenePrompt: page.scenePrompt,
      });
      updatePage(index, { illustrationUrl: result.illustrationUrl });
    } catch {
      setMessage(`第 ${index + 1} 张插画生成失败，可以单独重试`);
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
    await Promise.all(indexes.map(generateOne));
    setMessage('本轮插画已生成完成，不满意的图片可以单独重做');
  };

  const save = async (status: 'draft' | 'published') => {
    setSaving(true);
    setMessage(status === 'published' ? '正在发布课文…' : '正在保存草稿…');
    try {
      const saved = await saveLesson({ ...draft, status });
      setDraft(current => ({ ...current, id: saved.id, status }));
      setMessage(status === 'published' ? '课文已发布，学生端可以看到' : '草稿已保存');
      await onSaved();
      if (status === 'published') onClose();
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

  return <div className="lesson-editor-backdrop">
    <section className="lesson-editor" aria-label="AI 课文录入">
      <header className="lesson-editor-header">
        <div><span className="teacher-kicker">课文管理</span><h2>{lesson ? `编辑《${lesson.title}》` : '拍照录入新课文'}</h2><p>AI 先识别，老师校对确认后再发布。</p></div>
        <button className="drawer-close" onClick={onClose} aria-label="关闭课文编辑"><X /></button>
      </header>

      {!lesson && <section className="lesson-editor-card photo-import-card">
        <div><h3><Upload />上传课文照片</h3><p>支持一页或多页课文，最多 8 张。照片越正、文字越清晰，识别越准确。</p></div>
        <label className="photo-picker"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => void selectPhotos(event.target.files)} /><ImagePlus /><span>{photos.length ? `已选择 ${photos.length} 张` : '选择照片'}</span></label>
        {!!photos.length && <div className="photo-preview-row">{photos.map(photo => <Image key={photo.name} src={photo.dataUrl} alt={photo.name} />)}</div>}
        <Button onClick={() => void runRecognition()} disabled={!photos.length || recognizing}>{recognizing ? <LoaderCircle className="spin" /> : <Sparkles />}{recognizing ? '正在识别…' : 'AI 识别正文、拼音和分镜'}</Button>
      </section>}

      <div className="lesson-editor-steps"><span className={draft.fullText ? 'done' : 'active'}>照片识别</span><span className={draft.fullText ? 'active' : ''}>正文与拼音校对</span><span>教学重点</span><span>分镜与插画</span><span>预览发布</span></div>

      {message && <p className="lesson-editor-message" role="status">{message}</p>}

      {!!draft.fullText && <>
        <section className="lesson-editor-card lesson-meta-grid">
          <label>课文标题<Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
          <label>年级册次<Input value={draft.gradeLabel || ''} onChange={event => setDraft(current => ({ ...current, gradeLabel: event.target.value }))} /></label>
          <label>课文标识<Input value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: event.target.value }))} /></label>
          <label className="wide">课文正文<Textarea rows={8} value={draft.fullText} onChange={event => setDraft(current => ({ ...current, fullText: event.target.value }))} /></label>
        </section>

        {!!reviewNotes.length && <section className="lesson-review-notes"><strong>老师需要核对</strong>{reviewNotes.map(note => <p key={note}><Check />{note}</p>)}</section>}

        <section className="lesson-editor-card">
          <div className="lesson-section-title"><div><h3>逐字校对拼音</h3><p>橙色是多音字、轻声或变调。点拼音即可修改，输入 yi2 会自动变成 yí。</p></div></div>
          <div className="pinyin-edit-pages">{draft.pages.map((page, pageIndex) => <article key={`${page.pageNo}-${page.text}`}>
            <small>分镜 {pageIndex + 1}</small><p>{page.text}</p>
            <div className="pinyin-token-grid">{page.pinyin.map((token, tokenIndex) => <label className={token.needsReview ? 'needs-review' : ''} key={`${tokenIndex}-${token.text}`}>
              <Input value={token.pinyin} aria-label={`${token.text}的拼音`} onChange={event => updateToken(pageIndex, tokenIndex, { pinyin: event.target.value })} onBlur={event => updateToken(pageIndex, tokenIndex, { pinyin: normalizePinyin(event.target.value), needsReview: false })} />
              <span>{token.text}</span>
            </label>)}</div>
          </article>)}</div>
        </section>

        <section className="lesson-editor-card rubric-editor">
          <div className="lesson-section-title"><div><h3>设置教学重点</h3><p>这些规则会跟着本篇课文保存，孩子每次朗读都按它评测。</p></div></div>
          <label><strong>读流利</strong><Textarea value={draft.rubric.natural?.description || ''} onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, natural: { ...current.rubric.natural, kind: 'fluency', description: event.target.value } } }))} /></label>
          <label><strong>读准确：重点字</strong><Input value={keyTargets} placeholder="秋=qiū、气=qì" onChange={event => setAccuracyTargets(event.target.value)} /></label>
          <label><strong>读准确：轻声字词</strong><Input value={neutralTargets} placeholder="凉了、黄了、来了" onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, natural: { ...current.rubric.natural, neutralTargets: event.target.value.split(/[、,，]/u).map(item => item.trim()).filter(Boolean) } } }))} /></label>
          <div className="pronunciation-targets">
            <div className="pronunciation-targets-head"><div><strong>读准确：多音字与变调</strong><span>按“字 + 所在词组 + 目标读音”设置，同一个字可添加多条。</span></div><Button size="sm" variant="outline" onClick={addPronunciationTarget}><Plus />添加词组</Button></div>
            {pronunciationTargets.length ? pronunciationTargets.map((target, index) => <div className="pronunciation-target-row" key={index}>
              <label>检查哪个字<Input value={target.char} maxLength={1} placeholder="一" onChange={event => updatePronunciationTarget(index, { char: event.target.value })} /></label>
              <label>所在词组<Input value={target.phrase} placeholder="一片片" onChange={event => updatePronunciationTarget(index, { phrase: event.target.value })} /></label>
              <label>目标读音<Input value={target.reading} placeholder="yí" onChange={event => updatePronunciationTarget(index, { reading: event.target.value })} onBlur={event => updatePronunciationTarget(index, { reading: normalizePinyin(event.target.value) })} /></label>
              <Button size="sm" variant="ghost" aria-label={`删除${target.phrase || '这条'}读音规则`} onClick={() => removePronunciationTarget(index)}><Trash2 /></Button>
            </div>) : <p className="pronunciation-target-empty">还没有词组规则。比如可添加“一 / 一片片 / yí”“一 / 一群 / yì”。</p>}
            <label className="pronunciation-description">补充说明<Textarea value={draft.rubric.delivery?.description || ''} placeholder="例如：注意多音字在不同词语中的实际读音。" onChange={event => setDraft(current => ({ ...current, rubric: { ...current.rubric, delivery: { ...current.rubric.delivery, description: event.target.value } } }))} /></label>
          </div>
        </section>

        <section className="lesson-editor-card storyboard-editor">
          <div className="lesson-section-title"><div><h3>分镜与逐张插画</h3><p>AI 已按自然段、标点和句意分镜。可拆分、合并或改画面描述，再逐张生成。</p></div><Button variant="outline" onClick={addPage}><Plus />添加分镜</Button></div>
          <div className="storyboard-list">{draft.pages.map((page, index) => <article key={`scene-${index}`}>
            <div className="storyboard-number">{index + 1}</div>
            <div className="storyboard-copy">
              <label>对应原文<Textarea value={page.text} onChange={event => updatePage(index, { text: event.target.value })} /></label>
              <label>画面描述<Textarea value={page.scenePrompt} onChange={event => updatePage(index, { scenePrompt: event.target.value })} /></label>
              <div className="storyboard-actions"><Button size="sm" variant="outline" onClick={() => splitPage(index)}><Scissors />拆分</Button>{index < draft.pages.length - 1 && <Button size="sm" variant="outline" onClick={() => mergeNext(index)}><Merge />与下一条合并</Button>}<Button size="sm" variant="ghost" onClick={() => setDraft(current => ({ ...current, pages: reindexPages(current.pages.filter((_, pageIndex) => pageIndex !== index)) }))}><Trash2 />删除</Button></div>
            </div>
            <div className="storyboard-image">{page.illustrationUrl ? <Image src={page.illustrationUrl} alt={`第${index + 1}幅插画`} /> : <span><ImagePlus />等待生成</span>}<Button size="sm" onClick={() => void generateOne(index)} disabled={generating.has(index)}>{generating.has(index) ? <LoaderCircle className="spin" /> : <Sparkles />}{page.illustrationUrl ? '重新生成' : '生成这张'}</Button></div>
          </article>)}</div>
          <Button onClick={() => void generateAll()} disabled={!draft.pages.length || generating.size > 0}><Sparkles />逐张生成未完成的插画</Button>
        </section>

        <footer className="lesson-editor-footer"><Button variant="outline" onClick={() => void save('draft')} disabled={saving}><Save />保存草稿</Button><Button onClick={() => void save('published')} disabled={saving || !draft.pages.length}><Check />预览无误，发布课文</Button></footer>
      </>}
    </section>
  </div>;
}
