import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type {
  IllustrationGenerateRequest,
  LessonDraftInput,
  LessonRecognitionRequest,
} from '@shared/api.interface';
import { AuthService } from '../auth/auth.service';
import { LessonsService } from './lessons.service';

@Controller('api/lessons')
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list() {
    return this.lessons.catalog();
  }

  @Post('admin/recognize')
  async recognize(@Req() req: Request, @Body() input: LessonRecognitionRequest) {
    await this.auth.requireAccount(req, 'admin');
    return this.lessons.recognize(input);
  }

  @Post('admin/illustrations')
  async generateIllustration(@Req() req: Request, @Body() input: IllustrationGenerateRequest) {
    await this.auth.requireAccount(req, 'admin');
    return this.lessons.generateIllustration(input);
  }

  @Post('admin/save')
  async saveDraft(@Req() req: Request, @Body() input: LessonDraftInput) {
    await this.auth.requireAccount(req, 'admin');
    return this.lessons.saveDraft(input);
  }

  @Get('admin/:id')
  async getById(@Req() req: Request, @Param('id') id: string) {
    await this.auth.requireAccount(req, 'admin');
    return this.lessons.getById(id);
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.lessons.getBySlug(slug);
  }
}
