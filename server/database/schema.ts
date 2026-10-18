/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const studentLessonProgress = pgTable("student_lesson_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull(),
  lessonId: uuid("lesson_id").notNull(),
  latestAttemptId: uuid("latest_attempt_id"),
  latestEvaluationId: uuid("latest_evaluation_id"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastPracticedAt: customTimestamptz("last_practiced_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_student_lesson_progress").on(table.studentId, table.lessonId),
  index("idx_student_lesson_progress_recent").on(table.lastPracticedAt),
  foreignKey({
    columns: [table.studentId],
    foreignColumns: [userAccount.id],
    name: "student_lesson_progress_student_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.lessonId],
    foreignColumns: [lesson.id],
    name: "student_lesson_progress_lesson_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.latestAttemptId],
    foreignColumns: [readingAttempt.id],
    name: "student_lesson_progress_latest_attempt_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.latestEvaluationId],
    foreignColumns: [readingEvaluation.id],
    name: "student_lesson_progress_latest_evaluation_id_fkey",
  }).onDelete("set null"),
]);

export const readingEvaluation = pgTable("reading_evaluation", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull(),
  versionNo: integer("version_no").notNull().default(1),
  provider: varchar("provider", { length: 32 }).notNull().default('xfyun'),
  providerSid: varchar("provider_sid", { length: 128 }),
  algorithmVersion: varchar("algorithm_version", { length: 64 }).notNull(),
  rawXml: text("raw_xml"),
  totalScore: numeric("total_score"),
  accuracyScore: numeric("accuracy_score"),
  fluencyScore: numeric("fluency_score"),
  integrityScore: numeric("integrity_score"),
  toneScore: numeric("tone_score"),
  accuracyStars: integer("accuracy_stars"),
  naturalStars: integer("natural_stars"),
  deliveryStars: integer("delivery_stars"),
  teacherComment: text("teacher_comment"),
  aligned: boolean("aligned").notNull().default(false),
  issueCount: integer("issue_count").notNull().default(0),
  /**
   * @type { scores: Record<string, number | null>; goals: Record<string, unknown>; issues: { position: number | null; length: number; word: string; labels: string[]; start: number; end: number }[]; segments: { sentence: string; start: number; end: number }[]; words: unknown[]; aligned: boolean }
   */
  reportJson: jsonb("report_json").notNull().default('{}'),
  evaluatedAt: customTimestamptz("evaluated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_reading_evaluation_attempt_version").on(table.attemptId, table.versionNo),
  index("idx_reading_evaluation_dimension_stars").on(table.accuracyStars, table.naturalStars, table.deliveryStars),
  foreignKey({
    columns: [table.attemptId],
    foreignColumns: [readingAttempt.id],
    name: "reading_evaluation_attempt_id_fkey",
  }).onDelete("cascade"),
]);

export const readingClip = pgTable("reading_clip", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull(),
  lessonPageId: uuid("lesson_page_id"),
  sequenceNo: integer("sequence_no").notNull(),
  clipType: varchar("clip_type", { length: 32 }).notNull().default('body'),
  audioBucketId: varchar("audio_bucket_id", { length: 128 }).notNull(),
  audioFilePath: text("audio_file_path").notNull(),
  audioMimeType: varchar("audio_mime_type", { length: 128 }),
  audioDurationMs: integer("audio_duration_ms"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_reading_clip_attempt_sequence").on(table.attemptId, table.sequenceNo),
  foreignKey({
    columns: [table.attemptId],
    foreignColumns: [readingAttempt.id],
    name: "reading_clip_attempt_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.lessonPageId],
    foreignColumns: [lessonPage.id],
    name: "reading_clip_lesson_page_id_fkey",
  }).onDelete("set null"),
]);

export const readingAttempt = pgTable("reading_attempt", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull(),
  lessonId: uuid("lesson_id").notNull(),
  lessonRevision: integer("lesson_revision").notNull().default(1),
  recordingMode: varchar("recording_mode", { length: 32 }).notNull().default('full_text'),
  status: varchar("status", { length: 32 }).notNull().default('recorded'),
  audioBucketId: varchar("audio_bucket_id", { length: 128 }),
  audioFilePath: text("audio_file_path"),
  audioMimeType: varchar("audio_mime_type", { length: 128 }),
  audioDurationMs: integer("audio_duration_ms"),
  recordedAt: customTimestamptz("recorded_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_reading_attempt_student_lesson_time").on(table.studentId, table.lessonId, table.recordedAt),
  index("idx_reading_attempt_lesson_time").on(table.lessonId, table.recordedAt),
  foreignKey({
    columns: [table.studentId],
    foreignColumns: [userAccount.id],
    name: "reading_attempt_student_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.lessonId],
    foreignColumns: [lesson.id],
    name: "reading_attempt_lesson_id_fkey",
  }).onDelete("restrict"),
]);

export const lessonPage = pgTable("lesson_page", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id").notNull(),
  pageNo: integer("page_no").notNull(),
  pageType: varchar("page_type", { length: 32 }).notNull().default('body'),
  textContent: text("text_content").notNull(),
  /**
   * @type { text: string; pinyin: string }[]
   */
  pinyinJson: jsonb("pinyin_json").notNull().default('[]'),
  illustrationUrl: text("illustration_url"),
  demoAudioUrl: text("demo_audio_url"),
  videoStartMs: integer("video_start_ms"),
  videoEndMs: integer("video_end_ms"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_lesson_page_order").on(table.lessonId, table.pageNo),
  foreignKey({
    columns: [table.lessonId],
    foreignColumns: [lesson.id],
    name: "lesson_page_lesson_id_fkey",
  }).onDelete("cascade"),
]);

export const lesson = pgTable("lesson", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  title: varchar("title", { length: 100 }).notNull(),
  gradeLabel: varchar("grade_label", { length: 80 }),
  fullText: text("full_text").notNull(),
  /**
   * @type { paragraphs: string[] }
   */
  pinyinJson: jsonb("pinyin_json").notNull().default('[]'),
  /**
   * @type { accuracyTargets: { char: string; reading: string }[]; natural: { kind: string; description: string; neutralTargets?: string[] }; delivery: { kind?: string; description?: string; yiTargets?: { label: string; tone: number; reading: string }[] }; thresholds: { normalPhoneLevel: number; targetPhoneLevel: number } }
   */
  rubricJson: jsonb("rubric_json").notNull().default('{}'),
  revision: integer("revision").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default('published'),
  coverUrl: text("cover_url"),
  fullDemoUrl: text("full_demo_url"),
  videoTemplateUrl: text("video_template_url"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_lesson_slug").on(table.slug),
  index("idx_lesson_status").on(table.status),
]);

export const userSession = pgTable("user_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expiresAt: customTimestamptz("expires_at", { precision: 3 }).notNull(),
  revokedAt: customTimestamptz("revoked_at", { precision: 3 }),
  lastSeenAt: customTimestamptz("last_seen_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 64 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_user_session_token_hash").on(table.tokenHash),
  index("idx_user_session_account_expiry").on(table.accountId, table.expiresAt),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [userAccount.id],
    name: "user_session_account_id_fkey",
  }).onDelete("cascade"),
]);

export const userAccount = pgTable("user_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 64 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  accountType: varchar("account_type", { length: 32 }).notNull().default('student'),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  studentNo: varchar("student_no", { length: 64 }),
  className: varchar("class_name", { length: 80 }),
  status: varchar("status", { length: 32 }).notNull().default('active'),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: customTimestamptz("locked_until", { precision: 3 }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: customTimestamptz("last_login_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_user_account_username ON user_account USING btree (lower((username)::text)),
  index("idx_user_account_type_status").on(table.accountType, table.status),
]);

// table aliases
export const lessonTable = lesson;
export const lessonPageTable = lessonPage;
export const readingAttemptTable = readingAttempt;
export const readingClipTable = readingClip;
export const readingEvaluationTable = readingEvaluation;
export const studentLessonProgressTable = studentLessonProgress;
export const userAccountTable = userAccount;
export const userSessionTable = userSession;
