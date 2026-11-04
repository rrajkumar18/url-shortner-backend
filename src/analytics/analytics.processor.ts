import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service.js";

interface RedirectJob {
    shortCode:string
};

@Processor('analytics')
export class AnalyticsProcessor extends WorkerHost {

    constructor(private readonly prisma:PrismaService) {
        super();
    }

    async process(job: Job<RedirectJob>, token?: string): Promise<any> {
        if( job.name !== 'redirect' ) {
            throw new Error(`Unknown analytics job: ${job.name}`);
        }
        await this.prisma.url.update({
            where: {
                shortCode: job.data.shortCode
            },
            data: {
                redirectCount: {
                    increment: 1
                }
            }
        });
    }

}