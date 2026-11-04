import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsProcessor } from './analytics.processor.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'analytics'
    }),
    PrismaModule
  ],
  providers: [AnalyticsService, AnalyticsProcessor],
  exports: [AnalyticsService]
})
export class AnalyticsModule {

}
