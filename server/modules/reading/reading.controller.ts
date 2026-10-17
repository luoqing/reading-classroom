import { Body, Controller, Get, Header, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { EvaluationReportRequest, ReadingRequest, ReadingResult } from '../../../shared/api.interface';
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

  @Post('evaluate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async evaluate(@Req() req: Request, @Body() body: ReadingRequest): Promise<ReadingResult> {
    const account = await this.auth.requireAccount(req, 'student');
    return this.reading.evaluate(body, account.id);
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
