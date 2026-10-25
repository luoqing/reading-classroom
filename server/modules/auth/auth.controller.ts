import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ChangePasswordRequest, LoginRequest, LoginResult } from '@shared/api.interface';
import { AuthService, SESSION_COOKIE } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() input: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const result = await this.auth.login(input, req.headers['user-agent'], req.ip);
    res.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: result.expiresAt,
      path: '/',
    });
    return { account: result.account };
  }

  @Get('me')
  async me(@Req() req: Request): Promise<LoginResult | null> {
    const account = await this.auth.current(req);
    return account ? { account } : null;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('change-password')
  async changePassword(@Req() req: Request, @Body() input: ChangePasswordRequest): Promise<LoginResult> {
    const account = await this.auth.requireAccount(req);
    return { account: await this.auth.changePassword(account.id, input) };
  }
}
