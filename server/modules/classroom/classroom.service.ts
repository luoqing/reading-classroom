import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import {
  lesson,
  readingAttempt,
  readingEvaluation,
  studentLessonProgress,
  userAccount,
} from '@server/database/schema';
import type {
  AccountView,
  AdminDashboardResult,
  ReadingHistoryItem,
  StudentAccountInput,
  StudentCredential,
} from '@shared/api.interface';
import { signedStoredFileUrl } from '@server/common/storage-url';
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

  async dashboard(): Promise<AdminDashboardResult> {
    const rows = await this.db.select({
      account: userAccount,
      progress: studentLessonProgress,
      lessonTitle: lesson.title,
      attempt: readingAttempt,
      evaluation: readingEvaluation,
    }).from(userAccount)
      .leftJoin(studentLessonProgress, eq(studentLessonProgress.studentId, userAccount.id))
      .leftJoin(lesson, eq(lesson.id, studentLessonProgress.lessonId))
      .leftJoin(readingAttempt, eq(readingAttempt.id, studentLessonProgress.latestAttemptId))
      .leftJoin(readingEvaluation, eq(readingEvaluation.id, studentLessonProgress.latestEvaluationId))
      .where(eq(userAccount.accountType, 'student'))
      .orderBy(desc(studentLessonProgress.lastPracticedAt), userAccount.displayName);

    const seen = new Set<string>();
    const students = [];
    for (const row of rows) {
      if (seen.has(row.account.id)) continue;
      seen.add(row.account.id);
      students.push({
        ...this.accountView(row.account),
        attemptCount: row.progress?.attemptCount || 0,
        lastPracticedAt: row.progress?.lastPracticedAt?.toISOString() || null,
        lessonTitle: row.lessonTitle || null,
        latestAttemptId: row.attempt?.id || null,
        audioUrl: await signedStoredFileUrl(this.files, row.attempt?.audioBucketId || null, row.attempt?.audioFilePath || null),
        accuracyStars: row.evaluation?.accuracyStars ?? null,
        naturalStars: row.evaluation?.naturalStars ?? null,
        deliveryStars: row.evaluation?.deliveryStars ?? null,
        issueCount: row.evaluation?.issueCount ?? null,
        teacherComment: row.evaluation?.teacherComment || null,
      });
    }
    const practicedCount = students.filter(student => student.lastPracticedAt).length;
    const needsHelpCount = students.filter(student =>
      [student.accuracyStars, student.naturalStars, student.deliveryStars].some(stars => stars !== null && stars < 2)
      || (student.issueCount || 0) > 0,
    ).length;
    return {
      students,
      totals: { studentCount: students.length, practicedCount, needsHelpCount },
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
