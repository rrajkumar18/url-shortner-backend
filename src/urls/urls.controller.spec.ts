import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UrlsController } from './urls.controller.js';
import { UrlsService } from './urls.service.js';
import { OptionalAccessTokenGuard } from '../auth/guards/optional-access-token.guard.js';
import type { RequestWithUser } from '../auth/guards/access-token.guard.js';

describe('UrlsController', () => {
  let controller: UrlsController;
  let urlsService: {
    create: ReturnType<typeof vi.fn>;
    findOriginalUrl: ReturnType<typeof vi.fn>;
    getCacheStats: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    urlsService = {
      create: vi.fn(),
      findOriginalUrl: vi.fn(),
      getCacheStats: vi.fn(),
      getStats: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlsController],
      providers: [
        {
          provide: UrlsService,
          useValue: urlsService,
        },
      ],
    })
      .overrideGuard(OptionalAccessTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UrlsController>(UrlsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes userId from request.user.sub to UrlsService.create when authenticated', async () => {
    const expected = { id: 1, originalUrl: 'https://example.com', shortCode: 'abc' };
    urlsService.create.mockResolvedValue(expected);
    const req = { user: { sub: 7, email: 'a@b.com' } } as unknown as RequestWithUser;

    const result = await controller.create(
      { originalUrl: 'https://example.com' },
      req,
    );

    expect(urlsService.create).toHaveBeenCalledWith('https://example.com', 7);
    expect(result).toEqual(expected);
  });

  it('passes undefined userId to UrlsService.create when unauthenticated', async () => {
    const expected = { id: 2, originalUrl: 'https://example.com', shortCode: 'def' };
    urlsService.create.mockResolvedValue(expected);
    const req = {} as RequestWithUser;

    const result = await controller.create(
      { originalUrl: 'https://example.com' },
      req,
    );

    expect(urlsService.create).toHaveBeenCalledWith('https://example.com', undefined);
    expect(result).toEqual(expected);
  });

  describe('POST /urls with OptionalAccessTokenGuard', () => {
    let app: INestApplication;
    let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      jwtService = {
        verifyAsync: vi.fn(),
      };
      const configService = {
        getOrThrow: vi.fn().mockReturnValue('test-access-secret'),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [UrlsController],
        providers: [
          {
            provide: UrlsService,
            useValue: urlsService,
          },
        ],
      })
        .overrideGuard(OptionalAccessTokenGuard)
        .useValue(
          new OptionalAccessTokenGuard(
            jwtService as unknown as JwtService,
            configService as unknown as ConfigService,
          ),
        )
        .compile();

      app = moduleRef.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterEach(async () => {
      if (app) {
        await app.close();
      }
    });

    it('creates URL without userId when Authorization header is omitted', async () => {
      urlsService.create.mockResolvedValue({
        id: 1,
        originalUrl: 'https://example.com',
        shortCode: 'xyz123',
      });

      await request(app.getHttpServer())
        .post('/urls')
        .send({ originalUrl: 'https://example.com' })
        .expect(201);

      expect(urlsService.create).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('validates Bearer token and passes userId when Authorization header is provided', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 99, email: 'user@example.com' });
      urlsService.create.mockResolvedValue({
        id: 2,
        originalUrl: 'https://example.com',
        shortCode: 'xyz456',
      });

      await request(app.getHttpServer())
        .post('/urls')
        .set('Authorization', 'Bearer valid-token')
        .send({ originalUrl: 'https://example.com' })
        .expect(201);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
        secret: 'test-access-secret',
      });
      expect(urlsService.create).toHaveBeenCalledWith('https://example.com', 99);
    });

    it('returns 401 when an invalid Bearer token is provided', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('invalid token'));

      await request(app.getHttpServer())
        .post('/urls')
        .set('Authorization', 'Bearer bad-token')
        .send({ originalUrl: 'https://example.com' })
        .expect(401);

      expect(urlsService.create).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header has invalid format', async () => {
      await request(app.getHttpServer())
        .post('/urls')
        .set('Authorization', 'Token something')
        .send({ originalUrl: 'https://example.com' })
        .expect(401);

      expect(urlsService.create).not.toHaveBeenCalled();
    });

    it('validates access_token cookie and passes userId when cookie is provided', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 123, email: 'cookie@example.com' });
      urlsService.create.mockResolvedValue({
        id: 3,
        originalUrl: 'https://example.com',
        shortCode: 'cookie1',
      });

      await request(app.getHttpServer())
        .post('/urls')
        .set('Cookie', ['access_token=cookie-jwt-token'])
        .send({ originalUrl: 'https://example.com' })
        .expect(201);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('cookie-jwt-token', {
        secret: 'test-access-secret',
      });
      expect(urlsService.create).toHaveBeenCalledWith('https://example.com', 123);
    });

    it('returns 401 when an invalid access_token cookie is provided', async () => {
      jwtService.verifyAsync.mockRejectedValue(new JsonWebTokenError('invalid token'));

      await request(app.getHttpServer())
        .post('/urls')
        .set('Cookie', ['access_token=bad-cookie-token'])
        .send({ originalUrl: 'https://example.com' })
        .expect(401);

      expect(urlsService.create).not.toHaveBeenCalled();
    });
  });
});
