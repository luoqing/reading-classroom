import { Controller, Get, Param } from '@nestjs/common';
import { LessonsService } from './lessons.service';

@Controller('api/lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  async list() {
    return { items: await this.lessons.list() };
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.lessons.getBySlug(slug);
  }
}
