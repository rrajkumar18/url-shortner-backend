import { Module } from '@nestjs/common';
import { UrlsController } from './urls.controller.js';
import { UrlsService } from './urls.service.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  controllers: [UrlsController],
  providers: [UrlsService],
  imports: [AnalyticsModule]
})
export class UrlsModule {}
