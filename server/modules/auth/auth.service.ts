import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { userAccount, userSession } from '@server/database/schema';
import type {
  AccountRole,
  AccountView,
  ChangePasswordRequest,
  LoginRequest,
} from '@shared/api.interface';

export const SESSION_COOKIE = 'reading_session';
const SESSION_DAYS = 7;

export interface AuthenticatedAccount extends AccountView {}

@Injectable()
export class AuthService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private accountView(account: typeof userAccount.$inferSelect): AccountView {
    return {
      id: account.id,
      username: account.username,
      role: account.accountType as AccountRole,
      displayName: account.displayName,
      studentNo: account.studentNo,
      className: account.className,
      status: account.status,
      mustChangePassword: account.mustChangePassword,
    };
  }

  hashPassword(password: string) {
    if (password.length < 8 || password.length > 128) {
      throw new BadRequestException('密码长度需为 8–128 位');
    }
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  private verifyPassword(password: string, encoded: string) {
    const [algorithm, saltHex, hashHex] = encoded.split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private cookieValue(req: Request) {
    const header = req.headers.cookie || '';
    for (const pair of header.split(';')) {
      const [name, ...parts] = pair.trim().split('=');
      if (name === SESSION_COOKIE) return decodeURIComponent(parts.join('='));
    }
    return null;
  }

  async login(input: LoginRequest, userAgent?: string, ipAddress?: string) {
    const username = input.username?.trim().toLowerCase();
    if (!username || !input.password) throw new UnauthorizedException('账号或密码不正确');
    const [account] = await this.db
      .select()
      .from(userAccount)
      .where(sql`lower(${userAccount.username}) = ${username}`)
      .limit(1);
    if (!account || account.status !== 'active') throw new UnauthorizedException('账号或密码不正确');
    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('尝试次数过多，请稍后再试');
    }
    if (!this.verifyPassword(input.password, account.passwordHash)) {
      const failures = account.failedLoginCount + 1;
      await this.db.update(userAccount).set({
        failedLoginCount: failures >= 5 ? 0 : failures,
        lockedUntil: failures >= 5 ? new Date(Date.now() + 10 * 60 * 1000) : null,
        updatedAt: new Date(),
      }).where(eq(userAccount.id, account.id));
      throw new UnauthorizedException('账号或密码不正确');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insert(userSession).values({
      accountId: account.id,
      tokenHash: this.tokenHash(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 1000),
      ipAddress: ipAddress?.slice(0, 64),
    });
    await this.db.update(userAccount).set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(userAccount.id, account.id));
    return { token, expiresAt, account: this.accountView(account) };
  }

  async current(req: Request): Promise<AuthenticatedAccount | null> {
    const token = this.cookieValue(req);
    if (!token) return null;
    const [row] = await this.db
      .select({ account: userAccount, sessionId: userSession.id })
      .from(userSession)
      .innerJoin(userAccount, eq(userSession.accountId, userAccount.id))
      .where(and(
        eq(userSession.tokenHash, this.tokenHash(token)),
        isNull(userSession.revokedAt),
        gt(userSession.expiresAt, new Date()),
        eq(userAccount.status, 'active'),
      ))
      .limit(1);
    return row ? this.accountView(row.account) : null;
  }

  async requireAccount(req: Request, role?: AccountRole) {
    const account = await this.current(req);
    if (!account) throw new UnauthorizedException('请先登录');
    if (role && account.role !== role) throw new ForbiddenException('无权访问');
    return account;
  }

  async changePassword(accountId: string, input: ChangePasswordRequest) {
    if (!input.currentPassword || !input.newPassword) {
      throw new BadRequestException('请输入当前密码和新密码');
    }
    const [account] = await this.db.select().from(userAccount)
      .where(eq(userAccount.id, accountId)).limit(1);
    if (!account || !this.verifyPassword(input.currentPassword, account.passwordHash)) {
      throw new UnauthorizedException('当前密码不正确');
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }
    const [updated] = await this.db.update(userAccount).set({
      passwordHash: this.hashPassword(input.newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(userAccount.id, accountId)).returning();
    return this.accountView(updated);
  }

  async logout(req: Request) {
    const token = this.cookieValue(req);
    if (!token) return;
    await this.db.update(userSession).set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(userSession.tokenHash, this.tokenHash(token)));
  }
}
