import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AnalyticsService {

    constructor(@InjectQueue('analytics') private readonly analyticsQueue: Queue) {

    }

    async trackRedirect(shortCode:string):Promise<void> {
        await this.analyticsQueue.add(
            'redirect',
            { shortCode },
            {
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: 1000,
                removeOnFail: 5000
            }
        );
    }

}