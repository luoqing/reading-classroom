import { useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  Check,
  BookOpen,
  AudioLines,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  Mic,
  Square,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AdminLessonSummary,
  LessonDraftInput,
  LessonDraftPageInput,
  IllustrationStyle,
  LessonRecognitionImage,
  PinyinToken,
} from '@shared/api.interface';
import {
  generateLessonIllustration,
  generateLessonDemoAudio,
  recognizeLesson,
  saveLesson,
  uploadLessonDemoRecording,
} from '../../api/classroom';
import { Button } from '../../components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Image } from '../../components/ui/image';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import TeacherWorkspaceSidebar, { type WorkspaceView } from './TeacherWorkspaceSidebar';
import { paragraphsFromPagePinyin, restoreLegacyPagePinyin } from './legacy-lesson-pinyin';
import { countChangedPagesWithRetainedMedia } from './lesson-media-review';

interface LessonEditorProps {
  lesson?: AdminLessonSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onNavigate: (destination: WorkspaceView | 'new') => void;
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
  const restoredPinyin = restoreLegacyPagePinyin(lesson);
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
    fullDemoUrl: lesson.fullDemoStorageUrl || lesson.fullDemoUrl,
    fullDemoPreviewUrl: lesson.fullDemoUrl,
    pages: lesson.pages.map((page, index) => ({
      id: page.id,
      pageNo: index + 1,
      pageType: page.pageType === 'cover' ? 'cover' : 'body',
      text: page.text,
      pinyin: restoredPinyin[index],
      scenePrompt: page.scenePrompt || `表现“${page.text}”的儿童水彩绘本插画`,
      illustrationStyle: page.illustrationStyle || 'watercolor',
      illustrationUrl: page.illustrationStorageUrl || page.illustrationUrl,
      illustrationPreviewUrl: page.illustrationUrl,
      demoAudioUrl: page.demoAudioStorageUrl || page.demoAudioUrl,
      demoAudioPreviewUrl: page.demoAudioUrl,
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

function alignTokens(tokens: PinyinToken[], text: string): PinyinToken[] {
  const characters = [...text];
  let prefix = 0;
  while (prefix < tokens.length && prefix < characters.length && tokens[prefix].text === characters[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < tokens.length - prefix && suffix < characters.length - prefix
    && tokens[tokens.length - suffix - 1].text === characters[characters.length - suffix - 1]) suffix += 1;
  return [
    ...tokens.slice(0, prefix),
    ...characters.slice(prefix, characters.length - suffix).map(char => ({
      text: char,
      pinyin: '',
      needsReview: !/[，。！？、；：,.!?;:\s]/u.test(char),
    })),
    ...tokens.slice(tokens.length - suffix),
  ];
}

function draftWithPages(current: LessonDraftInput, pages: LessonDraftPageInput[], editedPageIndex?: number): LessonDraftInput {
  let fullText = pages.map(page => page.text).join('\n');
  if (editedPageIndex !== undefined && current.pages[editedPageIndex]?.pageType === 'cover') {
    fullText = current.fullText;
  } else if (editedPageIndex !== undefined && current.pages[editedPageIndex]?.text) {
    let searchFrom = 0;
    for (const page of current.pages.slice(0, editedPageIndex)) {
      const position = current.fullText.indexOf(page.text, searchFrom);
      if (position < 0) break;
      searchFrom = position + page.text.length;
    }
    const oldText = current.pages[editedPageIndex].text;
    const position = current.fullText.indexOf(oldText, searchFrom);
    if (position >= 0) fullText = current.fullText.slice(0, position) + pages[editedPageIndex].text
      + current.fullText.slice(position + oldText.length);
  }
  return {
    ...current,
    pages,
    fullText,
    pinyin: { paragraphs: paragraphsFromPagePinyin(fullText, pages) },
  };
}
const ILLUSTRATION_STYLES: Array<{ value: IllustrationStyle; label: string }> = [
  { value: 'watercolor', label: '水彩插画' },
  { value: 'storybook', label: '儿童绘本' },
  { value: 'chinese', label: '中国风' },
  { value: 'cartoon', label: '卡通插画' },
];

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

export default function LessonEditor({ lesson, onClose, onSaved, onNavigate }: LessonEditorProps) {
  const [draft, setDraft] = useState<LessonDraftInput>(() => lessonToDraft(lesson));
  const savedSnapshot = useRef(JSON.stringify(lessonToDraft(lesson)));
  const [pendingDestination, setPendingDestination] = useState<Parameters<LessonEditorProps['onNavigate']>[0] | 'close' | null>(null);
  const [pendingTokenRemoval, setPendingTokenRemoval] = useState<{ pageIndex: number; tokenIndex: number; text: string } | null>(null);
  const [pendingSave, setPendingSave] = useState<{ status: 'draft' | 'published'; closeOnSuccess: boolean; changedCount: number } | null>(null);
  const [step, setStep] = useState(lesson ? 1 : 0);
  const [furthestStep, setFurthestStep] = useState(lesson ? 1 : 0);
  const [photos, setPhotos] = useState<LessonRecognitionImage[]>([]);
  const [photoPage, setPhotoPage] = useState(0);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [illustrationErrors, setIllustrationErrors] = useState<Record<number, string>>({});
  const [audioErrors, setAudioErrors] = useState<Record<number, string>>({});
  const [audioGenerating, setAudioGenerating] = useState<Set<number>>(new Set());
  const [recordingTarget, setRecordingTarget] = useState<number | null>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const keyTargets = useMemo(() => (draft.rubric.accuracyTargets || [])
    .map(item => `${item.char}=${item.reading}`).join('、'), [draft.rubric.accuracyTargets]);
  const neutralTargets = useMemo(() => (draft.rubric.natural?.neutralTargets || []).join('、'), [draft.rubric.natural?.neutralTargets]);
  const pronunciationTargets = draft.rubric.delivery?.pronunciationTargets || [];
  const completedIllustrations = draft.pages.filter(page => page.illustrationUrl).length;
  const completedAudio = draft.pages.filter(page => page.demoAudioUrl).length;
  const steps = ['上传照片', '校对课文', '教学重点', '分镜插画', '确认发布'];
  const leaveEditor = (destination?: Parameters<LessonEditorProps['onNavigate']>[0]) => {
    const hasUnsavedChanges = JSON.stringify(draft) !== savedSnapshot.current
      || (photos.length > 0 && !draft.fullText);
    if (hasUnsavedChanges) {
      setPendingDestination(destination || 'close');
      return;
    }
    if (destination) onNavigate(destination);
    else onClose();
  };
  const confirmLeave = () => {
    if (pendingDestination && pendingDestination !== 'close') onNavigate(pendingDestination);
    else onClose();
    setPendingDestination(null);
  };
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
    setDraft(current => {
      const pages = current.pages.map((page, pageIndex) => {
        if (pageIndex !== index) return page;
        return {
          ...page,
          ...patch,
          ...(patch.text !== undefined ? { pinyin: alignTokens(page.pinyin, patch.text) } : {}),
        };
      });
      return patch.text !== undefined ? draftWithPages(current, pages, index) : { ...current, pages };
    });
    if (patch.text !== undefined || patch.scenePrompt !== undefined || patch.illustrationStyle !== undefined) {
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
      setDraft({
        ...recognizedDraft,
        pages: recognizedDraft.pages.map(page => ({ ...page, pinyin: alignTokens(page.pinyin, page.text) })),
      });
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
    setDraft(current => {
      const pages = current.pages.map((page, index) => {
        if (index !== pageIndex) return page;
        const tokens = page.pinyin.map((token, index) => {
          if (index !== tokenIndex) return token;
          if (patch.text === undefined || patch.text === token.text) return { ...token, ...patch };
          return { ...token, ...patch, pinyin: '', needsReview: !!patch.text && !/[，。！？、；：,.!?;:\s]/u.test(patch.text) };
        });
        const text = tokens.map(token => token.text).join('');
        return { ...page, text, pinyin: tokens };
      });
      return patch.text !== undefined ? draftWithPages(current, pages, pageIndex) : {
        ...current,
        pages,
        pinyin: { paragraphs: paragraphsFromPagePinyin(current.fullText, pages) },
      };
    });
  };

  const addToken = (pageIndex: number) => setDraft(current => draftWithPages(current,
    current.pages.map((page, index) => index === pageIndex
      ? { ...page, pinyin: [...page.pinyin, { text: '', pinyin: '', needsReview: true }] }
      : page),
    pageIndex,
  ));

  const removeToken = (pageIndex: number, tokenIndex: number) => setDraft(current => draftWithPages(current,
    current.pages.map((page, index) => {
      if (index !== pageIndex) return page;
      const pinyin = page.pinyin.filter((_, index) => index !== tokenIndex);
      return { ...page, pinyin, text: pinyin.map(token => token.text).join('') };
    }),
    pageIndex,
  ));

  const addPage = () => {
    setDraft(current => ({
      ...current,
      pages: reindexPages([...current.pages, {
        pageNo: current.pages.length + 1,
        pageType: 'body',
        text: '',
        pinyin: [],
        scenePrompt: '',
        illustrationStyle: 'watercolor',
        illustrationUrl: null,
        illustrationPreviewUrl: null,
      }]),
    }));
    setIllustrationErrors({});
  };

  const generateAudio = async (index: number): Promise<boolean> => {
    const text = index === -1 ? draft.fullText : draft.pages[index]?.text;
    if (!text?.trim()) {
      setAudioErrors(current => ({ ...current, [index]: '请先填写课文原文' }));
      return false;
    }
    setAudioGenerating(current => new Set(current).add(index));
    setAudioErrors(current => ({ ...current, [index]: '' }));
    try {
      const result = await generateLessonDemoAudio(text);
      if (index === -1) setDraft(current => ({ ...current, fullDemoUrl: result.audioUrl, fullDemoPreviewUrl: result.previewUrl }));
      else updatePage(index, { demoAudioUrl: result.audioUrl, demoAudioPreviewUrl: result.previewUrl });
      return true;
    } catch (error) {
      const serverMessage = isAxiosError(error) ? error.response?.data?.message : undefined;
      setAudioErrors(current => ({ ...current, [index]: typeof serverMessage === 'string' ? serverMessage : '生成失败，请重试' }));
      return false;
    } finally {
      setAudioGenerating(current => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
    }
  };

  const recordAudio = async (index: number) => {
    if (recordingTarget === index && recorderRef.current) {
      recorderRef.current.recorder.stop();
      setRecordingTarget(null);
      return;
    }
    if (recorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        recorderRef.current = null;
        setRecordingTarget(null);
        const blob = new Blob(chunks, { type: recorder.mimeType.split(';')[0] || 'audio/webm' });
        if (blob.size < 1000 || blob.size > 10_000_000) {
          setAudioErrors(current => ({ ...current, [index]: '录音过短或超过 10 MB，请重录' }));
          return;
        }
        setAudioGenerating(current => new Set(current).add(index));
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const result = await uploadLessonDemoRecording(dataUrl);
          if (index === -1) setDraft(current => ({ ...current, fullDemoUrl: result.audioUrl, fullDemoPreviewUrl: result.previewUrl }));
          else updatePage(index, { demoAudioUrl: result.audioUrl, demoAudioPreviewUrl: result.previewUrl });
          setAudioErrors(current => ({ ...current, [index]: '' }));
          setMessage('老师录音已替换，请保存草稿或发布课文');
        } catch {
          setAudioErrors(current => ({ ...current, [index]: '录音保存失败，请重试' }));
        } finally {
          setAudioGenerating(current => {
            const next = new Set(current);
            next.delete(index);
            return next;
          });
        }
      };
      recorder.start();
      recorderRef.current = { recorder, stream };
      setRecordingTarget(index);
      setAudioErrors(current => ({ ...current, [index]: '' }));
    } catch {
      setAudioErrors(current => ({ ...current, [index]: '无法使用麦克风，请检查浏览器权限' }));
    }
  };

  const generateOne = async (index: number, includeFullAudio = true): Promise<boolean> => {
    const page = draft.pages[index];
    if (!page.text.trim() || !page.scenePrompt.trim()) {
      setIllustrationErrors(current => ({ ...current, [index]: '请先填写原文和画面描述' }));
      return false;
    }
    setGenerating(current => new Set(current).add(index));
    setIllustrationErrors(current => ({ ...current, [index]: '' }));
    let imageDone = false;
    try {
      const result = await generateLessonIllustration({
        lessonTitle: draft.title,
        pageNo: index + 1,
        text: page.text,
        scenePrompt: page.scenePrompt,
        illustrationStyle: page.illustrationStyle || 'watercolor',
      });
      updatePage(index, {
        illustrationUrl: result.illustrationUrl,
        illustrationPreviewUrl: result.previewUrl,
      });
      imageDone = true;
    } catch (error) {
      const serverMessage = isAxiosError(error) ? error.response?.data?.message : undefined;
      const detail = typeof serverMessage === 'string' ? serverMessage : '请检查网络后重试';
      setIllustrationErrors(current => ({ ...current, [index]: detail }));
    }
    const pageAudioDone = page.demoAudioUrl ? true : await generateAudio(index);
    const fullAudioDone = !includeFullAudio || draft.fullDemoUrl ? true : await generateAudio(-1);
    setGenerating(current => {
      const next = new Set(current);
      next.delete(index);
      return next;
    });
    return imageDone && pageAudioDone && fullAudioDone;
  };

  const generateAll = async () => {
    const indexes = draft.pages.map((_, index) => index)
      .filter(index => !draft.pages[index].illustrationUrl || !draft.pages[index].demoAudioUrl);
    let failed = 0;
    if (!draft.fullDemoUrl && !await generateAudio(-1)) failed += 1;
    for (const index of indexes) {
      if (draft.pages[index].illustrationUrl) {
        if (!await generateAudio(index)) failed += 1;
      } else if (!await generateOne(index, false)) failed += 1;
    }
    setMessage(failed ? `有 ${failed} 项画面或朗读未生成，请查看对应提示并重试` : '插画和示范朗读已生成，可以试听并确认发布');
  };

  const saveNow = async (status: 'draft' | 'published', closeOnSuccess: boolean) => {
    setSaving(true);
    setMessage(status === 'published' ? '正在发布课文…' : '正在保存草稿…');
    try {
      const saved = await saveLesson({ ...draft, status });
      savedSnapshot.current = JSON.stringify({ ...draft, id: saved.id, status });
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

  const save = async (status: 'draft' | 'published', closeOnSuccess = status === 'published') => {
    const saved = JSON.parse(savedSnapshot.current) as LessonDraftInput;
    const changedCount = countChangedPagesWithRetainedMedia(saved, draft);
    if (changedCount) {
      setPendingSave({ status, closeOnSuccess, changedCount });
      return;
    }
    await saveNow(status, closeOnSuccess);
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
    <TeacherWorkspaceSidebar active="lessons" onNavigate={leaveEditor} />
    <section className="lesson-editor" aria-label="AI 课文录入">
      <header className="lesson-editor-header">
        <div><span className="teacher-kicker">朗读小屋 · 课文工作台</span><h2>{lesson ? `编辑《${lesson.title}》` : '录入新课文'}</h2><p>每一步只完成一件事，随时可以保存当前进度。</p></div>
        <button className="drawer-close" onClick={() => leaveEditor()} aria-label="关闭课文编辑"><X /></button>
      </header>

      <nav className="lesson-editor-steps" aria-label="录入流程">{steps.map((name, index) => <button key={name} type="button" className={index === step ? 'active' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined} disabled={index > furthestStep || (index === 0 && !!lesson)} onClick={() => goToStep(index)}><b>{index < step ? <Check size={16} /> : index + 1}</b><span><strong>{name}</strong><small>{['拍照或上传课本页面', '识别并校对文字内容', '设置本课的教学目标', '为每一段准备画面', '预览并发布课文'][index]}</small></span></button>)}</nav>

      {step === 0 && !lesson && <section className="lesson-editor-card photo-import-card">
        <div className="photo-import-intro"><span className="lesson-section-index">STEP 01 / 准备素材</span><h3>先拍下课文书页</h3><p>按课文顺序上传 1–8 张清晰照片，识别后可以修改。</p></div>
        <div className="photo-import-main"><label className="photo-picker"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { void selectPhotos(event.target.files); event.target.value = ''; }} /><span className="photo-picker-icon"><Upload /></span><strong>{photos.length ? '继续添加课文照片' : '选择课文照片'}</strong><small>支持 JPG、PNG、WebP · 单张不超过 10 MB</small></label>
          {!!photos.length && <div className="photo-preview-row">{photos.map((photo, index) => <div className="photo-preview" key={`${photo.name}-${index}`}><div><Image src={photo.dataUrl} alt={`第 ${index + 1} 页：${photo.name}`} /><button type="button" aria-label={`移除第 ${index + 1} 页照片`} onClick={() => setPhotos(current => current.filter((_, photoIndex) => photoIndex !== index))}><X size={14} /></button></div><span>第 {index + 1} 页</span></div>)}</div>}
          <div className="photo-import-action"><span>老师校对确认后才会发布给学生</span><Button onClick={() => void runRecognition()} disabled={!photos.length || recognizing}>{recognizing ? <LoaderCircle className="spin" /> : <Sparkles />}{recognizing ? '正在识别课文…' : '开始识别课文'}</Button></div>
        </div>
        <aside className="photo-guide"><h4><Lightbulb />拍摄小提示</h4><div className="photo-guide-items"><div><h5><b>1</b>书页放平</h5><span className="photo-guide-image photo-guide-image-1" role="img" aria-label="平放在桌上的课本示例" /><p>将课本平放在桌面上，保持页面平整。</p></div><div><h5><b>2</b>避开反光和阴影</h5><span className="photo-guide-image photo-guide-image-2" role="img" aria-label="错误示例：强光反射和阴影遮住了课本" /><p>反例：反光或阴影遮住文字时，请调整光线后重拍。</p></div><div><h5><b>3</b>文字完整入镜</h5><span className="photo-guide-image photo-guide-image-3" role="img" aria-label="整页文字完整入镜的示例" /><p>确保整页文字和插图都完整出现在画面中。</p></div></div></aside>
      </section>}

      {message && <p className="lesson-editor-message" role="status">{message}</p>}

      {!!draft.pages.length && step === 1 && <>
        <div className="lesson-proofread-heading"><div><span className="lesson-section-index">STEP 02 / 校对内容</span><h3>核对课文信息和每个字</h3><p>直接修改下方字格中的文字与拼音，橙色标记需要老师重点确认。</p></div><span>已识别 {photos.length || draft.pages.length} 页 · 待核对 {draft.pages.flatMap(page => page.pinyin).filter(token => token.needsReview).length} 处</span></div>
        <div className={photos.length ? 'lesson-proofread-grid' : ''}><section className="lesson-editor-card lesson-meta-card"><div className="lesson-section-title"><div><h3>课文信息</h3><p>先确认标题和年级，正文在下方逐字修改。</p></div></div><div className="lesson-meta-grid">
          <label>课文标题<Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
          <label>年级册次<Input value={draft.gradeLabel || ''} onChange={event => setDraft(current => ({ ...current, gradeLabel: event.target.value }))} /></label>
          <label>课文标识<Input value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: event.target.value }))} /></label>
        </div></section>{!!photos.length && <aside className="lesson-editor-card proofread-photo"><div><h3>原书照片</h3><span>第 {photoPage + 1} / {photos.length} 页</span></div><Image src={photos[photoPage]?.dataUrl || photos[0].dataUrl} alt={`第 ${photoPage + 1} 页原书照片`} /><div className="proofread-photo-actions"><button type="button" disabled={photoPage === 0} onClick={() => setPhotoPage(current => current - 1)}>上一页</button><button type="button" disabled={photoPage === photos.length - 1} onClick={() => setPhotoPage(current => current + 1)}>下一页</button></div></aside>}</div>

        {!!reviewNotes.length && <section className="lesson-review-notes"><strong>老师需要核对</strong>{reviewNotes.map(note => <p key={note}><Check />{note}</p>)}</section>}

        <section className="lesson-editor-card">
          <div className="lesson-section-title"><div><span className="lesson-section-index">STEP 02 / 校对内容</span><h3>逐字校对文字和拼音</h3><p>上方改拼音，下方改文字；改字后请重新确认读音。输入 yi2 会自动变成 yí。</p></div></div>
          <div className="pinyin-edit-pages">{draft.pages.map((page, pageIndex) => <article key={page.id || pageIndex}>
            <small>分镜 {pageIndex + 1}</small><p>{page.text}</p>
            <div className="pinyin-token-grid">{page.pinyin.map((token, tokenIndex) => <div className={`pinyin-token${token.needsReview ? ' needs-review' : ''}`} key={tokenIndex}>
              <Input value={token.pinyin} aria-label={`第${pageIndex + 1}段第${tokenIndex + 1}字的拼音`} onChange={event => updateToken(pageIndex, tokenIndex, { pinyin: event.target.value })} onBlur={event => updateToken(pageIndex, tokenIndex, { pinyin: normalizePinyin(event.target.value), needsReview: !!token.text && !/[，。！？、；：,.!?;:\s]/u.test(token.text) && !event.target.value.trim() })} />
              <Input value={token.text} aria-label={`第${pageIndex + 1}段第${tokenIndex + 1}字的文字`} maxLength={1} placeholder="字" onChange={event => { if (event.target.value || !token.text) updateToken(pageIndex, tokenIndex, { text: event.target.value }); }} />
              <button type="button" className="pinyin-token-delete" aria-label={`删除第${pageIndex + 1}段第${tokenIndex + 1}格的文字和拼音`} title="删除文字和拼音" onClick={() => setPendingTokenRemoval({ pageIndex, tokenIndex, text: token.text })}><X size={12} aria-hidden="true" /></button>
            </div>)}<button type="button" className="pinyin-add-token" onClick={() => addToken(pageIndex)}><Plus size={15} />添加字</button></div>
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
          <div className="storyboard-heading"><div><span className="lesson-section-index">STEP 04 / 画面与声音</span><h3>为每一段准备画面和朗读</h3><p>生成插画时同步生成示范朗读，老师可试听后重录自己的版本。</p></div><div className="illustration-progress"><span>插画 <strong>{completedIllustrations} / {draft.pages.length}</strong> · 朗读 <strong>{completedAudio} / {draft.pages.length}</strong></span><div role="progressbar" aria-valuenow={completedIllustrations} aria-valuemin={0} aria-valuemax={draft.pages.length} aria-label="插画完成进度"><i style={{ width: `${draft.pages.length ? completedIllustrations / draft.pages.length * 100 : 0}%` }} /></div></div></div>
          <div className="demo-audio-full"><div><strong><AudioLines size={19} />整篇示范朗读</strong><span>学生在课文页听到的完整示范读音</span></div>{draft.fullDemoUrl && <audio controls preload="none" src={draft.fullDemoPreviewUrl || draft.fullDemoUrl} aria-label="整篇示范朗读" />}{!draft.fullDemoUrl && <span className="demo-audio-pending">生成画面时自动准备</span>}<div className="demo-audio-actions"><Button size="sm" variant="outline" disabled={audioGenerating.has(-1) || recordingTarget !== null} onClick={() => void generateAudio(-1)}>{audioGenerating.has(-1) ? <LoaderCircle className="spin" /> : <Sparkles />}{draft.fullDemoUrl ? '重新生成' : '生成朗读'}</Button><Button size="sm" variant="outline" disabled={audioGenerating.has(-1) || (recordingTarget !== null && recordingTarget !== -1)} onClick={() => void recordAudio(-1)}>{recordingTarget === -1 ? <Square /> : <Mic />}{recordingTarget === -1 ? '结束录音' : draft.fullDemoUrl ? '重录' : '自己录'}</Button></div>{audioErrors[-1] && <small role="alert">{audioErrors[-1]}</small>}</div>
          <div className="storyboard-list">{draft.pages.map((page, index) => <article key={`scene-${page.id || index}`}>
            <div className="storyboard-card-head"><strong>第 {index + 1} 段</strong><button type="button" disabled={draft.pages.length === 1} onClick={() => { setDraft(current => draftWithPages(current, reindexPages(current.pages.filter((_, pageIndex) => pageIndex !== index)))); setIllustrationErrors({}); }} aria-label={`删除第${index + 1}段`} title="删除这一段"><Trash2 size={16} />删除</button></div>
            <label className="storyboard-original">原文内容 <span>（可编辑）</span><Textarea value={page.text} placeholder="输入这一段的课文原文" onChange={event => updatePage(index, { text: event.target.value })} /><small>{page.text.length} / 500</small></label>
            <div className="storyboard-scene"><label>画面描述 <span>（可编辑）</span><Textarea value={page.scenePrompt} placeholder="描述要画出的角色、动作和场景" onChange={event => updatePage(index, { scenePrompt: event.target.value })} /><small>{page.scenePrompt.length} / 200</small></label><div className="storyboard-style"><span>参考风格</span><div role="group" aria-label={`第${index + 1}段插画风格`}>{ILLUSTRATION_STYLES.map(style => <button key={style.value} type="button" className={(page.illustrationStyle || 'watercolor') === style.value ? 'selected' : ''} aria-pressed={(page.illustrationStyle || 'watercolor') === style.value} onClick={() => updatePage(index, { illustrationStyle: style.value })}>{style.label}</button>)}</div></div></div>
            <div className="storyboard-image"><div className="storyboard-image-head"><span>插画预览</span>{page.illustrationUrl && <button type="button" onClick={() => void generateOne(index)} disabled={generating.has(index)}><Sparkles size={15} />替换</button>}</div>{page.illustrationUrl && !illustrationErrors[index] ? <img src={page.illustrationPreviewUrl || page.illustrationUrl} alt={`第${index + 1}幅插画`} onError={() => setIllustrationErrors(current => ({ ...current, [index]: '预览加载失败，请重新生成' }))} /> : <div className={`storyboard-image-empty${illustrationErrors[index] ? ' failed' : ''}`}><ImagePlus /><strong>{illustrationErrors[index] ? '生成失败，请重试' : '准备好生成插画'}</strong><span>{illustrationErrors[index] || '确认画面描述和风格后，生成这一段的插画。'}</span><Button size="sm" onClick={() => void generateOne(index)} disabled={generating.has(index)}>{generating.has(index) ? <LoaderCircle className="spin" /> : <Sparkles />}{generating.has(index) ? '正在生成…' : illustrationErrors[index] ? '重新生成' : '生成插画'}</Button></div>}<div className="storyboard-demo-audio"><div className="storyboard-image-head"><span><AudioLines size={15} />本段示范朗读</span>{page.demoAudioUrl && <span className="demo-audio-ready"><Check size={13} />已准备</span>}</div>{page.demoAudioUrl && <audio controls preload="none" src={page.demoAudioPreviewUrl || page.demoAudioUrl} aria-label={`第${index + 1}段示范朗读`} />}{!page.demoAudioUrl && <p>学生练习这一段时，可先听示范读音。</p>}<div className="demo-audio-actions"><Button size="sm" variant="outline" disabled={audioGenerating.has(index) || recordingTarget !== null} onClick={() => void generateAudio(index)}>{audioGenerating.has(index) ? <LoaderCircle className="spin" /> : <Sparkles />}{page.demoAudioUrl ? '重新生成' : 'AI 生成'}</Button><Button size="sm" variant="outline" disabled={audioGenerating.has(index) || (recordingTarget !== null && recordingTarget !== index)} onClick={() => void recordAudio(index)}>{recordingTarget === index ? <Square /> : <Mic />}{recordingTarget === index ? '结束录音' : page.demoAudioUrl ? '重录' : '自己录'}</Button></div>{audioErrors[index] && <small role="alert">{audioErrors[index]}</small>}</div></div>
          </article>)}</div>
          <div className="storyboard-footer-actions"><Button variant="outline" onClick={addPage}><Plus />添加一段</Button><Button onClick={() => void generateAll()} disabled={!draft.pages.length || generating.size > 0 || audioGenerating.size > 0 || (completedIllustrations === draft.pages.length && completedAudio === draft.pages.length && !!draft.fullDemoUrl)}><Sparkles />生成剩余插画和朗读</Button></div>
        </section>}

      {!!draft.fullText && step === 4 && <section className="lesson-editor-card lesson-publish-card"><span className="lesson-section-index">STEP 05 / 确认发布</span><h3>最后检查一次</h3><p>发布后，学生就可以看到这篇课文并开始朗读。</p><div className="lesson-publish-summary"><div><small>课文</small><strong>{draft.title || '未填写标题'}</strong><span>{draft.gradeLabel || '未填写年级'}</span></div><div><small>分镜</small><strong>{draft.pages.length} 页</strong><span>正文与拼音已录入</span></div><div><small>插画与声音</small><strong>{completedIllustrations} 幅 · {completedAudio} 段</strong><span>{draft.fullDemoUrl ? '整篇朗读已准备' : '整篇朗读尚未生成'}</span></div></div><div className="lesson-publish-preview"><h4>学生看到的课文正文</h4><p>{draft.fullText}</p></div></section>}

      {!!draft.fullText && <footer className="lesson-editor-footer"><Button variant="outline" onClick={() => goToStep(step - 1)} disabled={step === 0 || (step === 1 && !!lesson)}>返回上一步</Button><span className="lesson-footer-spacer" /><Button variant="outline" onClick={() => void save(draft.status === 'published' ? 'published' : 'draft', false)} disabled={saving}><Save />{draft.status === 'published' ? '保存修改' : '保存草稿'}</Button>{step < 4 ? <Button onClick={nextStep}><Check />下一步：{steps[step + 1]}</Button> : <Button onClick={() => void save('published')} disabled={saving || !draft.pages.length}><Check />确认发布课文</Button>}</footer>}
    </section>
    <AlertDialog open={pendingDestination !== null} onOpenChange={open => { if (!open) setPendingDestination(null); }}>
      <AlertDialogContent className="z-[100]"><AlertDialogHeader><AlertDialogTitle>还有未保存的修改</AlertDialogTitle><AlertDialogDescription>离开后，这次修改将不会保留。可以先返回保存草稿。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={confirmLeave}>不保存，离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={pendingTokenRemoval !== null} onOpenChange={open => { if (!open) setPendingTokenRemoval(null); }}>
      <AlertDialogContent className="z-[100]"><AlertDialogHeader><AlertDialogTitle>删除{pendingTokenRemoval?.text ? `“${pendingTokenRemoval.text}”` : '这个字格'}和拼音？</AlertDialogTitle><AlertDialogDescription>这格的文字和拼音会一并删除，已有插画和示范读音会保留。保存后才会应用到课文。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingTokenRemoval) removeToken(pendingTokenRemoval.pageIndex, pendingTokenRemoval.tokenIndex); setPendingTokenRemoval(null); }}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={pendingSave !== null} onOpenChange={open => { if (!open) setPendingSave(null); }}>
      <AlertDialogContent className="z-[100]"><AlertDialogHeader><AlertDialogTitle>课文内容已调整，检查插画和示范读音？</AlertDialogTitle><AlertDialogDescription>有 {pendingSave?.changedCount} 段文字或拼音与上次保存时不同，且已有插画或示范读音。现有素材会保留，可能与新内容不一致。可以先去分镜插画页重新生成，也可以保留原素材继续保存。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => goToStep(3)}>去检查并重新生成</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingSave) void saveNow(pendingSave.status, pendingSave.closeOnSuccess); setPendingSave(null); }}>保留原素材，继续保存</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div></div>;
}
