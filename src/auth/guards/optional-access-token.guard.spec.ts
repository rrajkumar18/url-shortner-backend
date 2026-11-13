import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptionalAccessTokenGuard } from './optional-access-token.guard.js';
import type { RequestWithUser } from './access-token.guard.js';

function createHttpContext(options?: {
  authorization?: string;
  accessCookie?: string;
}): {
  context: ExecutionContext;
  request: Partial<RequestWithUser>;
} {
  const request: Partial<RequestWithUser> = {
    headers:
      options?.authorization === undefined
        ? {}
        : { authorization: options.authorization },
    cookies:
      options?.accessCookie === undefined
        ? {}
        : { access_token: options.accessCookie },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('OptionalAccessTokenGuard', () => {
  let guard: OptionalAccessTokenGuard;
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    jwtService = {
      verifyAsync: vi.fn(),
    };
    configService = {
      getOrThrow: vi.fn().mockReturnValue('test-access-secret'),
    };
    guard = new OptionalAccessTokenGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('allows requests without an Authorization header or access_token cookie', async () => {
    const { context, request } = createHttpContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('allows requests when access_token cookie is empty and no Authorization header is set', async () => {
    const { context, request } = createHttpContext({ accessCookie: '' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('validates a Bearer token and attaches the user payload to the request', async () => {
    const payload = { sub: 42, email: 'user@example.com' };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, request } = createHttpContext({
      authorization: 'Bearer valid-jwt-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt-token', {
      secret: 'test-access-secret',
    });
    expect(request.user).toEqual(payload);
  });

  it('validates an access_token cookie when Authorization header is absent', async () => {
    const payload = { sub: 77, email: 'cookie@example.com' };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, request } = createHttpContext({
      accessCookie: 'valid-cookie-jwt',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-cookie-jwt', {
      secret: 'test-access-secret',
    });
    expect(request.user).toEqual(payload);
  });

  it('throws UnauthorizedException when access_token cookie is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      new JsonWebTokenError('invalid signature'),
    );
    const { context } = createHttpContext({ accessCookie: 'bad-cookie-jwt' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when Authorization header format is invalid', async () => {
    const { context } = createHttpContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when Bearer token is empty', async () => {
    const { context } = createHttpContext({ authorization: 'Bearer ' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token is expired', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      new TokenExpiredError('jwt expired', new Date()),
    );
    const { context } = createHttpContext({
      authorization: 'Bearer expired-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      new JsonWebTokenError('invalid signature'),
    );
    const { context } = createHttpContext({
      authorization: 'Bearer bad-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when payload lacks a numeric sub', async () => {
    jwtService.verifyAsync.mockResolvedValue({ email: 'user@example.com' });
    const { context } = createHttpContext({
      authorization: 'Bearer missing-sub-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
