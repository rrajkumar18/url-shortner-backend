import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {

    private readonly client:RedisClientType;

    constructor() {
        this.client = createClient({
            socket: {
                host : process.env.REDIS_HOST,
                port : Number(process.env.REDIS_PORT),
                ...(process.env.REDIS_TLS === 'true' ? { tls: true as const } : {})
            },
            username: process.env.REDIS_USERNAME || undefined,
            password: process.env.REDIS_PASSWORD || undefined
        });

        this.client.on('error', (error) => {
            console.error('Redis error:', error.message);
        });
    }

    async onModuleInit() {
        await this.client.connect();
    }

    async onModuleDestroy() {
        if( this.client.isOpen ) {
            this.client.quit();
        }
    }

    async get(key:string):Promise<string | null> {
        return this.client.get(key);
    }

    async set(key:string, value:string, ttlSeconds=3600):Promise<void> {
        await this.client.set(key, value, {
            expiration: {
                type : 'EX',
                value: ttlSeconds
            }
        });
    }

    async del(key:string):Promise<void> {
        await this.client.del(key);
    }

    async testConnection(): Promise<string> {
        await this.set('url-shortener:test', 'Redis is working');
        return (await this.get('url-shortener:test')) ?? 'No value found';
    }

    
    async increment(key: string): Promise<number> {
        return this.client.incr(key);
    }

}
