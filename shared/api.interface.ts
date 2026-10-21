export type AccountRole = 'admin' | 'student';

export interface AccountView {
  id: string;
  username: string;
  role: AccountRole;
  displayName: string;
  studentNo: string | null;
  className: string | null;
  status: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResult {
  account: AccountView;
}

export interface LessonPageView {
  id: string;
  pageNo: number;
  pageType: string;
  text: string;
  pinyin: { text: string; pinyin: string }[];
  illustrationUrl: string | null;
  demoAudioUrl: string | null;
  videoStartMs: number | null;
  videoEndMs: number | null;
}

export interface LessonListItem {
  id: string;
  slug: string;
  title: string;
  gradeLabel: string | null;
  revision: number;
  coverUrl: string | null;
}

export interface LessonCatalog {
  items: LessonListItem[];
  pinyinFontUrl: string | null;
}

export interface LessonRubric {
  accuracyTargets?: { char: string; reading: string }[];
  natural?: {
    kind?: string;
    description?: string;
    neutralTargets?: string[];
  };
  delivery?: {
    kind?: string;
    description?: string;
    yiTargets?: { label: string; tone: number; reading: string }[];
    focusTargets?: string[];
  };
  thresholds?: {
    normalPhoneLevel?: number;
    targetPhoneLevel?: number;
    targetRepeatedLevel?: number;
  };
}

export interface LessonView {
  id: string;
  slug: string;
  title: string;
  gradeLabel: string | null;
  fullText: string;
  pinyin: { paragraphs: string[] };
  rubric: LessonRubric;
  revision: number;
  coverUrl: string | null;
  fullDemoUrl: string | null;
  videoTemplateUrl: string | null;
  pages: LessonPageView[];
}

export interface StoredAudio {
  bucketId: string;
  filePath: string;
  mimeType: string;
  durationMs: number;
}

export interface StoredClip extends StoredAudio {
  pageId: string | null;
  sequenceNo: number;
  clipType: 'cover' | 'body';
}

export type ReadingEvaluationProvider = 'xfyun' | 'tencent';
export type ReadingEvaluationMode = ReadingEvaluationProvider | 'both';

export interface ProviderEvaluationResult {
  provider: ReadingEvaluationProvider;
  evaluationId?: string;
  rawResult: string;
  sid?: string;
}

export interface ProviderEvaluationError {
  provider: ReadingEvaluationProvider;
  message: string;
}

export interface ReadingRequest {
  lessonSlug: string;
  text: string;
  audio: string;
  provider: ReadingEvaluationMode;
  recordingMode: 'full_text' | 'dubbing';
  storedAudio: StoredAudio;
  clips?: StoredClip[];
}

export interface ReadingResult {
  attemptId: string;
  evaluations: ProviderEvaluationResult[];
  errors: ProviderEvaluationError[];
}

export interface GuestReadingRequest {
  text: string;
  audio: string;
  provider: ReadingEvaluationMode;
}

export interface GuestReadingResult {
  evaluations: ProviderEvaluationResult[];
  errors: ProviderEvaluationError[];
}

export interface EvaluationReportRequest {
  accuracyStars: number | null;
  naturalStars: number | null;
  deliveryStars: number | null;
  teacherComment: string;
  scores: Record<string, number | null>;
  report: Record<string, unknown>;
  issueCount: number;
  aligned: boolean;
}

export interface ReadingHistoryItem {
  attemptId: string;
  evaluationId: string | null;
  lessonTitle: string;
  recordedAt: string;
  recordingMode: string;
  audioUrl: string | null;
  accuracyStars: number | null;
  naturalStars: number | null;
  deliveryStars: number | null;
  teacherComment: string | null;
  issueCount: number | null;
  report: Record<string, unknown> | null;
}

export interface StudentAccountInput {
  username: string;
  displayName: string;
  studentNo?: string;
  className?: string;
  initialPassword?: string;
}

export interface StudentCredential {
  account: AccountView;
  initialPassword: string;
}

export interface AdminStudentSummary extends AccountView {
  attemptCount: number;
  periodAttemptCount: number;
  latestRecordedAt: string | null;
  lastLoginAt: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  latestAttemptId: string | null;
  audioUrl: string | null;
  accuracyStars: number | null;
  naturalStars: number | null;
  deliveryStars: number | null;
  issueCount: number | null;
  teacherComment: string | null;
}

export type AdminDashboardRange = 'week' | '7d' | '30d' | 'all';

export interface AdminDashboardFilters {
  className?: string;
  lessonId?: string;
  range?: AdminDashboardRange;
}

export interface AdminDimensionSummary {
  averageStars: number | null;
  ratedCount: number;
  needsPracticeCount: number;
}

export interface AdminLessonSummary extends LessonView {
  status: string;
  pageCount: number;
  attemptCount: number;
  completedStudentCount: number;
  latestRecordedAt: string | null;
}

export interface AdminDashboardResult {
  students: AdminStudentSummary[];
  totals: {
    studentCount: number;
    completedStudentCount: number;
    completionRate: number;
    periodAttemptCount: number;
    averageAttempts: number;
    needsHelpCount: number;
  };
  dimensions: {
    accuracy: AdminDimensionSummary;
    natural: AdminDimensionSummary;
    delivery: AdminDimensionSummary;
  };
  options: {
    classNames: string[];
    lessons: { id: string; title: string }[];
  };
  lessons: AdminLessonSummary[];
  period: {
    range: AdminDashboardRange;
    label: string;
    startAt: string | null;
    endAt: string;
  };
}
