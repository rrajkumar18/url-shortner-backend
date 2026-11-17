import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule} from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UrlsModule } from './urls/urls.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuthModule } from './auth/auth.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal:true}),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100
      }
    ]),
    UrlsModule,
    PrismaModule,
    RedisModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT ?? 6379)
      }
    }),
    AnalyticsModule,
    AuthModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    AppService,
  ],
})
export class AppModule {}
