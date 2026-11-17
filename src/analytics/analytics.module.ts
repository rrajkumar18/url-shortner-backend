import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsProcessor } from './analytics.processor.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BullMqConfigModule } from '../redis/bullmq.module.js';

@Module({
    imports: [
        BullMqConfigModule,
        BullModule.registerQueue({
            name: 'analytics',
        }),
        PrismaModule,
    ],
    providers: [AnalyticsService, AnalyticsProcessor],
    exports: [AnalyticsService],
})
export class AnalyticsModule {}