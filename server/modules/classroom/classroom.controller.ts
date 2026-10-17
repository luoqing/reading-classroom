import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { StudentAccountInput } from '@shared/api.interface';
import { AuthService } from '../auth/auth.service';
import { ClassroomService } from './classroom.service';

@Controller('api/admin')
export class ClassroomController {
  constructor(
    private readonly auth: AuthService,
    private readonly classroom: ClassroomService,
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    await this.auth.requireAccount(req, 'admin');
    return this.classroom.dashboard();
  }

  @Post('students')
  async createStudents(@Req() req: Request, @Body() body: { students: StudentAccountInput[] }) {
    await this.auth.requireAccount(req, 'admin');
    return { credentials: await this.classroom.createStudents(body.students) };
  }

  @Patch('students/:id/status')
  async setStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    await this.auth.requireAccount(req, 'admin');
    return this.classroom.setStudentStatus(id, body.status);
  }

  @Post('students/:id/reset-password')
  async resetPassword(@Req() req: Request, @Param('id') id: string) {
    await this.auth.requireAccount(req, 'admin');
    return this.classroom.resetPassword(id);
  }

  @Get('students/:id/attempts')
  async studentAttempts(@Req() req: Request, @Param('id') id: string) {
    await this.auth.requireAccount(req, 'admin');
    return { items: await this.classroom.studentAttempts(id) };
  }
}
