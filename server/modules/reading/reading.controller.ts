import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import type { EvaluationReportRequest, GuestReadingRequest, GuestReadingResult, ReadingRequest, ReadingResult } from '../../../shared/api.interface';
import { AuthService } from '../auth/auth.service';
import { ReadingService } from './reading.service';

@Controller('api/reading')
export class ReadingController {
  constructor(
    @Inject(ReadingService) private readonly reading: ReadingService,
    private readonly auth: AuthService,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): { configured: boolean } {
    return { configured: this.reading.configured() };
  }

  @Get('teacher-speech/:key')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Content-Type', 'audio/mpeg')
  async teacherSpeech(@Param('key') key: string): Promise<StreamableFile> {
    return new StreamableFile(await this.reading.teacherSpeech(key));
  }

  @Post('evaluate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async evaluate(@Req() req: Request, @Body() body: ReadingRequest): Promise<ReadingResult> {
    const account = await this.auth.requireAccount(req, 'student');
    return this.reading.evaluate(body, account.id);
  }

  @Post('evaluate-guest')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  evaluateGuest(@Body() body: GuestReadingRequest): Promise<GuestReadingResult> {
    return this.reading.evaluateGuest(body);
  }

  @Patch('evaluations/:id/report')
  async saveReport(@Req() req: Request, @Param('id') id: string, @Body() body: EvaluationReportRequest) {
    const account = await this.auth.requireAccount(req, 'student');
    return this.reading.saveReport(id, account.id, body);
  }

  @Get('history')
  async history(@Req() req: Request) {
    const account = await this.auth.requireAccount(req, 'student');
    return { items: await this.reading.history(account.id) };
  }
}
