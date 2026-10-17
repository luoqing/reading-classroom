import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { LessonsService } from './lessons.service';

@Controller('api/lessons')
export class LessonsController {
  constructor(private readonly auth: AuthService, private readonly lessons: LessonsService) {}

  @Get()
  async list(@Req() req: Request) {
    await this.auth.requireAccount(req);
    return { items: await this.lessons.list() };
  }

  @Get(':slug')
  async getBySlug(@Req() req: Request, @Param('slug') slug: string) {
    await this.auth.requireAccount(req);
    return this.lessons.getBySlug(slug);
  }
}
