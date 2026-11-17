
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT || 6379),
                username: process.env.REDIS_USERNAME || 'default',
                password: process.env.REDIS_PASSWORD,
                // Enable TLS for Upstash
                ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                connectTimeout: 15000,
            },
        }),
    ],
    exports: [BullModule],
})
export class BullMqConfigModule {}
