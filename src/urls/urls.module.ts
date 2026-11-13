import { Module } from '@nestjs/common';
import { UrlsController } from './urls.controller.js';
import { UrlsService } from './urls.service.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  controllers: [UrlsController],
  providers: [UrlsService],
  imports: [AnalyticsModule, AuthModule]
})
export class UrlsModule {}
