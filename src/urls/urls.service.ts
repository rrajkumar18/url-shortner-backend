import { Injectable, NotFoundException, ConflictException, InternalServerErrorException, BadRequestException, Scope, Inject, MessageEvent } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { REQUEST } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { validateDestination } from './url-validation.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import type { Request } from 'express';


@Injectable({
    scope: Scope.REQUEST
})
export class UrlsService {

    private cacheHits = 0;
    private cacheMisses = 0;
    private cacheErrors = 0;

    // Adding to avoid cache stampede
    private readonly pendingLookups = new Map<string, Promise<string | null>>();

    constructor(
        private readonly prisma:PrismaService, 
        private readonly redis:RedisService, 
        private readonly analytics:AnalyticsService,
        @Inject(REQUEST) private readonly request:Request
    ) {}

    private getCacheKey(shortCode: string): string {
        return `url:${shortCode}`;
    }

    async create(originalUrl:string, userId?: number) {
        validateDestination(originalUrl);
        const maxAttempts:number = 5;
        for( let attempt=0; attempt < maxAttempts; attempt++ ) {
            const shortCode = randomBytes(9).toString('base64url');
            const cachedKey = this.getCacheKey(shortCode);
            try {
                const url = await this.prisma.url.create({
                    data : {
                        originalUrl,
                        shortCode,
                        ...(userId !== undefined ? { userId } : {}),
                    }
                });
                // do not await here
                this.redis.set(cachedKey, originalUrl, 3600);                
                return {
                    id: url.id,
                    originalUrl: url.originalUrl,
                    shortCode: url.shortCode,
                    shortUrl: `${this.request.protocol}://${this.request.get('host')}/urls/${url.shortCode}`,
                    createdAt: url.createdAt,
                };
            } catch ( error ) {
                if( error instanceof Prisma.PrismaClientKnownRequestError && error.code == 'P2002') {
                    // Duplicate short code was generated
                    continue;
                }
                throw error;
            }
        }
        throw new ConflictException('Could not generate a unique short code. Please try again.');                
    }

    async findOriginalUrl(shortCode:string):Promise<string> {
        // First, get from Redis
        const cachedKey = this.getCacheKey(shortCode);
        const NOT_FOUND = '__URL_NOT_FOUND__';
        try {
            const cachedUrl = await this.redis.get(cachedKey);            
            if (cachedUrl === NOT_FOUND) {
                throw new NotFoundException('Short URL not found');
            }
            if( cachedUrl != null ) {
                this.cacheHits++;
                // Push to Queue and increase counter in Redis also
                await this.analytics.trackRedirect(shortCode);
                await this.redis.increment(`stats:redirects:${shortCode}`);
                return cachedUrl;
            }
            this.cacheMisses++;
        } catch ( error ) {
            if( error instanceof NotFoundException ) {
                throw error;
            }
            this.cacheErrors++;
            console.error('Redis cache read failed:', error);
        }
        
        // Query postgres if not found in Redis
        const originalUrl = await this.findOriginalUrlInDatabase(shortCode);
        if (originalUrl === null) {
            try {
                await this.redis.set(cachedKey, NOT_FOUND);
            } catch (error) {
                console.error('Redis cache write failed:', error);
            }
            throw new NotFoundException('Short URL not found');
        }

        // Save the key in Redis
        try {
            await this.redis.set(cachedKey, originalUrl, 3600);
        } catch ( error ) {
            console.error('Redis cache write failed:', error);
        }
        await this.analytics.trackRedirect(shortCode);
        return originalUrl;
    }

    private async findOriginalUrlInDatabase(shortCode: string): Promise<string | null> {
        const existing = this.pendingLookups.get(shortCode);        
        
        if (existing) {
            return existing;
        }

        const lookup = this.prisma.url.findUnique({
            where: { shortCode },
            select: { originalUrl: true },
        }).then((url) => url?.originalUrl ?? null);

        this.pendingLookups.set(shortCode, lookup);

        try {
            return await lookup;
        } finally {
            if (this.pendingLookups.get(shortCode) === lookup) {
                this.pendingLookups.delete(shortCode);
            }
        }
    }

    getCacheStats() {
        const total = this.cacheHits + this.cacheMisses;

        return {
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            cacheErrors: this.cacheErrors,
            hitRate: total === 0 ? 0 : Number(((this.cacheHits / total) * 100).toFixed(2)),
        };
    }


    async getStats(shortCode: string) {
        const exists = await this.prisma.url.findUnique({
            where: { shortCode },
            select: { id: true },
        });

        if (!exists) {
            throw new NotFoundException('Short URL not found');
        }

        const count = await this.redis.get(
            `stats:redirects:${shortCode}`,
        );

        return {
            shortCode,
            redirectCount: Number(count ?? 0),
        };
    }

    async getAllLinks(userId:number|undefined, page:number, limit:number) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.prisma.$transaction([
            this.prisma.url.findMany({
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                },
                where: {
                    userId: userId
                },
                select: {
                    id: true,
                    originalUrl: true,
                    createdAt: true,
                    shortCode: true,
                    userId: true,
                    redirectCount: true,
                }
            }),
            this.prisma.url.count({
                where: {
                    userId: userId
                }
            })
        ]);        
        return {
            data,
            pagination: {
                total, page, limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            }
        };
    }

    async getDashboardStats(userId:number|undefined) {
        const [totalLinks, totalClicks] = await this.prisma.$transaction([
            this.prisma.url.count({
                where: {
                    userId: userId
                }
            }),
            this.prisma.url.aggregate({
                _sum: {
                    redirectCount: true
                },
                where: {
                    userId: userId
                }
            })
        ]);
        return {
            totalLinks,
            "totalClicks": totalClicks['_sum']['redirectCount']
        };
    }

    subscribeToUserClicks(userId: number): Observable<MessageEvent> {
        const channel = `user:${userId}:clicks`;
        return new Observable<MessageEvent>((subscriber) => {
            const listener = (message: string) => {
                try {
                    const data = JSON.parse(message);
                    subscriber.next({ data } as MessageEvent);
                } catch (err) {
                    console.error(`Failed to parse click message on ${channel}:`, err);
                }
            };
            
            // 1. Start listening to Redis Pub/Sub for this user
            this.redis.subscribe(channel, listener).catch((err) => {
                subscriber.error(err);
            });

            // 2. Teardown: runs automatically when the SSE client disconnects
            return () => {
                this.redis.unsubscribe(channel, listener).catch((err) => {
                    console.error(`Failed to unsubscribe from ${channel}:`, err);
                });
            };
        });
    }

}
