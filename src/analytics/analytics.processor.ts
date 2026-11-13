import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";

interface RedirectJob {
    shortCode:string
};

@Processor('analytics')
export class AnalyticsProcessor extends WorkerHost {

    constructor(
        private readonly prisma:PrismaService,
        private readonly redis:RedisService
    ) {
        super();
    }

    async process(job: Job<RedirectJob>, token?: string): Promise<any> {
        if( job.name !== 'redirect' ) {
            throw new Error(`Unknown analytics job: ${job.name}`);
        }
        try {
            const updated = await this.prisma.url.update({
                where: {
                    shortCode: job.data.shortCode
                },
                data: {
                    redirectCount: {
                        increment: 1
                    }
                },
                select: {
                    shortCode: true,
                    redirectCount: true,
                    userId: true
                }
            });
            if (updated.userId) {                
                await this.redis.publish(
                    `user:${updated.userId}:clicks`,
                    JSON.stringify({
                        shortCode: updated.shortCode,
                        clicks: updated.redirectCount,
                    }),
                );
            }
        } catch ( err ) {
            console.log(err);
        }
    }

}