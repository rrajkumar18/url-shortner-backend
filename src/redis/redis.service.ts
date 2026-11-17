import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {

    private readonly client:RedisClientType;
    private readonly subscriberClient: RedisClientType;

    constructor() {
        const clientOptions = {
            socket: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT),
                ...(process.env.REDIS_TLS === 'true' ? { tls: true as const } : {})
            },
            username: process.env.REDIS_USERNAME || undefined,
            password: process.env.REDIS_PASSWORD || undefined
        };
        
        this.client = createClient(clientOptions);

        this.client.on('connect', () => console.log('[REDIS] client Connecting...'));
        this.client.on('ready', () => console.log('[REDIS] client Connected!'));
        this.client.on('error', (error) => console.error('[REDIS] Error:', error));
        this.client.on('reconnecting', () => console.log('[REDIS] Reconnecting...'));

        // Dedicated connection for Pub/Sub listeners
        // In node-redis (v4+), once a Redis connection enters subscriber mode via .subscribe(), 
        // it cannot execute regular commands (get, set, etc.). 
        // To prevent breaking cache, create a dedicated duplicated client

        this.subscriberClient = this.client.duplicate();    
        this.subscriberClient.on('connect', () => console.log('[REDIS] Subscriber Connecting...'));
        this.subscriberClient.on('ready', () => console.log('[REDIS] Subscriber Connected!'));
        this.subscriberClient.on('error', (error) => console.error('[REDIS] Subscriber Error:', error));
        this.subscriberClient.on('reconnecting', () => console.log('[REDIS] Subscriber Reconnecting...'));

    }

    async onModuleInit() {
        await Promise.all([
            this.client.connect(),
            this.subscriberClient.connect()
        ]);
    }

    async onModuleDestroy() {
        await Promise.all([
            this.client.isOpen ? this.client.quit() : Promise.resolve(),
            this.subscriberClient.isOpen ? this.subscriberClient.quit() : Promise.resolve()
        ]);
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

    // --- PUB / SUB METHODS ---

    async publish(channel: string, message: string): Promise<number> {
        return this.client.publish(channel, message);
    }

    async subscribe(channel: string, listener: (message: string) => void): Promise<void> {
        await this.subscriberClient.subscribe(channel, listener);
    }

    async unsubscribe(channel: string, listener?: (message: string) => void): Promise<void> {
        await this.subscriberClient.unsubscribe(channel, listener);
    }

}
