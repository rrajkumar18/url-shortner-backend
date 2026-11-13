import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UrlsService } from './urls.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';

describe('UrlsService', () => {
  let service: UrlsService;
  let prisma: {
    url: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let redis: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      url: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    redis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: AnalyticsService, useValue: { trackRedirect: vi.fn() } },
        {
          provide: REQUEST,
          useValue: {
            protocol: 'http',
            get: vi.fn().mockReturnValue('localhost:3000'),
          },
        },
      ],
    }).compile();

    service = await module.resolve<UrlsService>(UrlsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a short URL without userId when not provided', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    prisma.url.create.mockImplementation(async ({ data }) => ({
      id: 1,
      originalUrl: data.originalUrl,
      shortCode: data.shortCode,
      createdAt,
    }));

    const result = await service.create('https://example.com');

    expect(prisma.url.create).toHaveBeenCalledWith({
      data: {
        originalUrl: 'https://example.com',
        shortCode: expect.any(String),
      },
    });
    expect(result).toMatchObject({
      id: 1,
      originalUrl: 'https://example.com',
      shortCode: expect.any(String),
      shortUrl: expect.stringMatching(/^http:\/\/localhost:3000\/urls\/.+$/),
      createdAt,
    });
  });

  it('creates a short URL with userId when provided', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    prisma.url.create.mockImplementation(async ({ data }) => ({
      id: 2,
      userId: data.userId,
      originalUrl: data.originalUrl,
      shortCode: data.shortCode,
      createdAt,
    }));

    const result = await service.create('https://example.com', 42);

    expect(prisma.url.create).toHaveBeenCalledWith({
      data: {
        originalUrl: 'https://example.com',
        shortCode: expect.any(String),
        userId: 42,
      },
    });
    expect(result).toMatchObject({
      id: 2,
      originalUrl: 'https://example.com',
      shortCode: expect.any(String),
      createdAt,
    });
  });
});
