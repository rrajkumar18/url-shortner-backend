import { Injectable, NotFoundException, ConflictException, InternalServerErrorException, BadRequestException, Scope, Inject } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { validateDestination } from './url-validation.js';
import { AnalyticsService } from '../analytics/analytics.service.js';


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

    async create(originalUrl:string) {
        validateDestination(originalUrl);
        const maxAttempts:number = 5;
        for( let attempt=0; attempt < maxAttempts; attempt++ ) {
            const shortCode = randomBytes(9).toString('base64url');
            const cachedKey = this.getCacheKey(shortCode);
            try {
                const url = await this.prisma.url.create({
                    data : {
                        originalUrl,
                        shortCode
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
                // Push to Queue instead of directly hitting Redis
                await this.analytics.trackRedirect(shortCode);
                // await this.redis.increment(`stats:redirects:${shortCode}`);
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
        // await this.redis.increment(`stats:redirects:${shortCode}`);
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

}
