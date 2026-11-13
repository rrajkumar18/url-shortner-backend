import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    registerUser: ReturnType<typeof vi.fn>;
    loginUser: ReturnType<typeof vi.fn>;
    refreshTokens: ReturnType<typeof vi.fn>;
    logoutUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authService = {
      registerUser: vi.fn(),
      loginUser: vi.fn(),
      refreshTokens: vi.fn(),
      logoutUser: vi.fn(),
    };

    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'JWT_REFRESH_DAYS') return '604800000';
        if (key === 'JWT_ACCESS_TTL') return '900000';
        throw new Error(`Unexpected key: ${key}`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('sets access_token cookie with path "/" and refresh_token with path "/auth" on login', async () => {
    authService.loginUser.mockResolvedValue({
      message: 'Login successful',
      accessToken: 'access-jwt',
      refreshToken: 'refresh-jwt',
      user: { id: 1, firstName: 'A', lastName: 'B', email: 'a@b.com' },
    });
    const res = { cookie: vi.fn() } as unknown as Response;

    await controller.login({ email: 'a@b.com', password: 'secret' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-jwt',
      expect.objectContaining({ path: '/auth', httpOnly: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      'access-jwt',
      expect.objectContaining({ path: '/', httpOnly: true }),
    );
  });

  it('sets access_token cookie with path "/" on refresh', async () => {
    authService.refreshTokens.mockResolvedValue({
      accessToken: 'new-access-jwt',
      refreshToken: 'new-refresh-jwt',
    });
    const req = { cookies: { refresh_token: 'old-refresh' } } as unknown as Request;
    const res = { cookie: vi.fn() } as unknown as Response;

    await controller.refresh(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-refresh-jwt',
      expect.objectContaining({ path: '/auth', httpOnly: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      'new-access-jwt',
      expect.objectContaining({ path: '/', httpOnly: true }),
    );
  });

  it('clears access_token cookie with path "/" and refresh_token with path "/auth" on logout', async () => {
    authService.logoutUser.mockResolvedValue({ message: 'Logged out' });
    const req = { cookies: { refresh_token: 'refresh-jwt' } } as unknown as Request;
    const res = { clearCookie: vi.fn() } as unknown as Response;

    await controller.logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/auth', httpOnly: true }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/', httpOnly: true }),
    );
  });
});
