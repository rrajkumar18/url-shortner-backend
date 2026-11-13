import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenGuard } from './access-token.guard.js';

@Injectable()
export class OptionalAccessTokenGuard extends AccessTokenGuard {
    constructor(jwtService: JwtService, config: ConfigService) {
        super(jwtService, config);
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const hasAuthHeader = request.headers.authorization !== undefined;
        const hasAccessCookie = Boolean(request.cookies?.access_token);

        if (!hasAuthHeader && !hasAccessCookie) {
            return true;
        }
        return super.canActivate(context);
    }
}
