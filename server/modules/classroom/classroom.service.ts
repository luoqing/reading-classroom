import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import {
  lesson,
  lessonPage,
  readingAttempt,
  readingEvaluation,
  userAccount,
} from '@server/database/schema';
import type {
  AccountView,
  AdminDashboardFilters,
  AdminDashboardResult,
  AdminDashboardRange,
  AdminDimensionSummary,
  AdminStudentSummary,
  ReadingHistoryItem,
  StudentAccountInput,
  StudentCredential,
} from '@shared/api.interface';
import { signedStorageObjectUrl, signedStoredFileUrl } from '@server/common/storage-url';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ClassroomService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
    private readonly auth: AuthService,
  ) {}

  private generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(10);
    return [...bytes].map(value => alphabet[value % alphabet.length]).join('');
  }

  private accountView(account: typeof userAccount.$inferSelect): AccountView {
    return {
      id: account.id,
      username: account.username,
      role: 'student',
      displayName: account.displayName,
      studentNo: account.studentNo,
      className: account.className,
      status: account.status,
    };
  }

  async createStudents(inputs: StudentAccountInput[]): Promise<StudentCredential[]> {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 200) {
      throw new BadRequestException('每次请提交 1–200 个学生账号');
    }
    const credentials: StudentCredential[] = [];
    for (const input of inputs) {
      const username = input.username?.trim().toLowerCase();
      const displayName = input.displayName?.trim();
      if (!username || !/^[a-z0-9._-]{3,64}$/.test(username) || !displayName) {
        throw new BadRequestException('学生账号需为 3–64 位字母、数字或 . _ -，姓名不能为空');
      }
      const [existing] = await this.db.select({ id: userAccount.id }).from(userAccount)
        .where(sql`lower(${userAccount.username}) = ${username}`).limit(1);
      if (existing) throw new ConflictException(`账号 ${username} 已存在`);
      const initialPassword = input.initialPassword || this.generatePassword();
      const [account] = await this.db.insert(userAccount).values({
        username,
        passwordHash: this.auth.hashPassword(initialPassword),
        accountType: 'student',
        displayName,
        studentNo: input.studentNo?.trim() || null,
        className: input.className?.trim() || null,
      }).returning();
      credentials.push({ account: this.accountView(account), initialPassword });
    }
    return credentials;
  }

  async setStudentStatus(id: string, status: string) {
    if (!['active', 'disabled'].includes(status)) throw new BadRequestException('账号状态不正确');
    const [account] = await this.db.update(userAccount).set({ status, updatedAt: new Date() })
      .where(and(eq(userAccount.id, id), eq(userAccount.accountType, 'student'))).returning();
    if (!account) throw new NotFoundException('学生账号不存在');
    return this.accountView(account);
  }

  async resetPassword(id: string) {
    const initialPassword = this.generatePassword();
    const [account] = await this.db.update(userAccount).set({
      passwordHash: this.auth.hashPassword(initialPassword),
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(and(eq(userAccount.id, id), eq(userAccount.accountType, 'student'))).returning();
    if (!account) throw new NotFoundException('学生账号不存在');
    return { account: this.accountView(account), initialPassword };
  }

  private dashboardPeriod(range: AdminDashboardRange) {
    const now = new Date();
    const chinaOffsetMs = 8 * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    if (range === 'all') {
      return { range, label: '全部时间', startAt: null, endAt: now };
    }
    if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      return {
        range,
        label: range === '7d' ? '最近 7 天' : '最近 30 天',
        startAt: new Date(now.getTime() - days * dayMs),
        endAt: now,
      };
    }
    const chinaNow = new Date(now.getTime() + chinaOffsetMs);
    const localDayStart = Date.UTC(
      chinaNow.getUTCFullYear(),
      chinaNow.getUTCMonth(),
      chinaNow.getUTCDate(),
    );
    const daysAfterMonday = (chinaNow.getUTCDay() + 6) % 7;
    return {
      range: 'week' as const,
      label: '本周',
      startAt: new Date(localDayStart - daysAfterMonday * dayMs - chinaOffsetMs),
      endAt: now,
    };
  }

  private dimensionSummary(values: Array<number | null>): AdminDimensionSummary {
    const rated = values.filter((value): value is number => value !== null);
    const total = rated.reduce((sum, value) => sum + value, 0);
    return {
      averageStars: rated.length ? Math.round(total / rated.length * 10) / 10 : null,
      ratedCount: rated.length,
      needsPracticeCount: rated.filter(value => value < 2).length,
    };
  }

  async dashboard(filters: AdminDashboardFilters = {}): Promise<AdminDashboardResult> {
    const validRanges: AdminDashboardRange[] = ['week', '7d', '30d', 'all'];
    const range = filters.range && validRanges.includes(filters.range)
      ? filters.range
      : 'week';
    const period = this.dashboardPeriod(range);
    const accountRows = await this.db.select().from(userAccount)
      .where(eq(userAccount.accountType, 'student'))
      .orderBy(userAccount.displayName);
    const lessonRows = await this.db.select().from(lesson).orderBy(asc(lesson.title));
    const pageRows = await this.db.select({ lessonId: lessonPage.lessonId }).from(lessonPage);
    const attemptRows = await this.db.select({
      attempt: readingAttempt,
      evaluation: readingEvaluation,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    }).from(readingAttempt)
      .innerJoin(lesson, eq(lesson.id, readingAttempt.lessonId))
      .leftJoin(readingEvaluation, eq(readingEvaluation.attemptId, readingAttempt.id))
      .orderBy(desc(readingAttempt.recordedAt), desc(readingEvaluation.versionNo));

    const seenAttempts = new Set<string>();
    const uniqueAttempts = attemptRows.filter(row => {
      if (seenAttempts.has(row.attempt.id)) return false;
      seenAttempts.add(row.attempt.id);
      return true;
    });
    const filteredAttempts = uniqueAttempts.filter(row => {
      if (filters.lessonId && row.lessonId !== filters.lessonId) return false;
      return !period.startAt || row.attempt.recordedAt >= period.startAt;
    });
    const selectedAccounts = accountRows.filter(account =>
      !filters.className || account.className === filters.className,
    );
    const students: AdminStudentSummary[] = await Promise.all(selectedAccounts.map(async account => {
      const latest = filteredAttempts.find(row => row.attempt.studentId === account.id);
      const lifetimeAttempts = uniqueAttempts.filter(row => row.attempt.studentId === account.id);
      const periodAttempts = filteredAttempts.filter(row => row.attempt.studentId === account.id);
      return {
        ...this.accountView(account),
        attemptCount: lifetimeAttempts.length,
        periodAttemptCount: periodAttempts.length,
        latestRecordedAt: latest?.attempt.recordedAt.toISOString() || null,
        lastLoginAt: account.lastLoginAt?.toISOString() || null,
        lessonId: latest?.lessonId || null,
        lessonTitle: latest?.lessonTitle || null,
        latestAttemptId: latest?.attempt.id || null,
        audioUrl: await signedStoredFileUrl(
          this.files,
          latest?.attempt.audioBucketId || null,
          latest?.attempt.audioFilePath || null,
        ),
        accuracyStars: latest?.evaluation?.accuracyStars ?? null,
        naturalStars: latest?.evaluation?.naturalStars ?? null,
        deliveryStars: latest?.evaluation?.deliveryStars ?? null,
        issueCount: latest?.evaluation?.issueCount ?? null,
        teacherComment: latest?.evaluation?.teacherComment || null,
      };
    }));
    students.sort((left, right) => {
      if (!left.latestRecordedAt && !right.latestRecordedAt) {
        return left.displayName.localeCompare(right.displayName, 'zh-CN');
      }
      if (!left.latestRecordedAt) return 1;
      if (!right.latestRecordedAt) return -1;
      return right.latestRecordedAt.localeCompare(left.latestRecordedAt)
        || left.displayName.localeCompare(right.displayName, 'zh-CN');
    });

    const activeStudents = students.filter(student => student.status === 'active');
    const completedStudents = activeStudents.filter(student => student.periodAttemptCount > 0);
    const periodAttemptCount = completedStudents.reduce(
      (sum, student) => sum + student.periodAttemptCount,
      0,
    );
    const needsHelpCount = completedStudents.filter(student =>
      [student.accuracyStars, student.naturalStars, student.deliveryStars].some(stars => stars !== null && stars < 2)
      || (student.issueCount || 0) > 0,
    ).length;
    const pageCounts = new Map<string, number>();
    pageRows.forEach(row => pageCounts.set(row.lessonId, (pageCounts.get(row.lessonId) || 0) + 1));
    const lessons = await Promise.all(lessonRows.map(async item => {
      const itemAttempts = uniqueAttempts.filter(row => row.lessonId === item.id);
      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        gradeLabel: item.gradeLabel,
        revision: item.revision,
        coverUrl: await signedStorageObjectUrl(this.files, item.coverUrl),
        status: item.status,
        pageCount: pageCounts.get(item.id) || 0,
        attemptCount: itemAttempts.length,
        completedStudentCount: new Set(itemAttempts.map(row => row.attempt.studentId)).size,
        latestRecordedAt: itemAttempts[0]?.attempt.recordedAt.toISOString() || null,
      };
    }));
    const studentCount = activeStudents.length;
    return {
      students,
      totals: {
        studentCount,
        completedStudentCount: completedStudents.length,
        completionRate: studentCount
          ? Math.round(completedStudents.length / studentCount * 100)
          : 0,
        periodAttemptCount,
        averageAttempts: studentCount
          ? Math.round(periodAttemptCount / studentCount * 10) / 10
          : 0,
        needsHelpCount,
      },
      dimensions: {
        accuracy: this.dimensionSummary(completedStudents.map(student => student.accuracyStars)),
        natural: this.dimensionSummary(completedStudents.map(student => student.naturalStars)),
        delivery: this.dimensionSummary(completedStudents.map(student => student.deliveryStars)),
      },
      options: {
        classNames: [...new Set(accountRows.map(account => account.className).filter(
          (className): className is string => Boolean(className),
        ))].sort(),
        lessons: lessonRows.filter(item => item.status === 'published')
          .map(item => ({ id: item.id, title: item.title })),
      },
      lessons,
      period: {
        range,
        label: period.label,
        startAt: period.startAt?.toISOString() || null,
        endAt: period.endAt.toISOString(),
      },
    };
  }

  async studentAttempts(studentId: string): Promise<ReadingHistoryItem[]> {
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
}
