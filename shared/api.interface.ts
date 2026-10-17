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

export interface LessonView {
  id: string;
  slug: string;
  title: string;
  gradeLabel: string | null;
  fullText: string;
  pinyin: { paragraphs: string[] };
  rubric: Record<string, unknown>;
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

export interface ReadingRequest {
  lessonSlug: string;
  text: string;
  audio: string;
  recordingMode: 'full_text' | 'dubbing';
  storedAudio: StoredAudio;
  clips?: StoredClip[];
}

export interface ReadingResult {
  attemptId: string;
  evaluationId: string;
  xml: string;
  sid?: string;
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
  lastPracticedAt: string | null;
  lessonTitle: string | null;
  latestAttemptId: string | null;
  audioUrl: string | null;
  accuracyStars: number | null;
  naturalStars: number | null;
  deliveryStars: number | null;
  issueCount: number | null;
  teacherComment: string | null;
}

export interface AdminDashboardResult {
  students: AdminStudentSummary[];
  totals: {
    studentCount: number;
    practicedCount: number;
    needsHelpCount: number;
  };
}
