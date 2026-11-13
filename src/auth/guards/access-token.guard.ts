import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, TokenExpiredError, JsonWebTokenError } from "@nestjs/jwt";
import { ConfigService } from '@nestjs/config';
import type { Request } from "express";

export interface AccessTokenPayload {
    sub: number;
    email: string;
}

export interface RequestWithUser extends Request {
    user?: AccessTokenPayload;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {

    constructor(
        private readonly jwtService:JwtService,
        private readonly config:ConfigService
    ){}

    private get accessSecret():string {
        return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    }

    private extractToken(request: Request): string {
        const authHeader = request.headers.authorization;

        if (authHeader !== undefined) {
            if (!authHeader.startsWith('Bearer ')) {
                throw new UnauthorizedException({
                    statusCode: 401,
                    message: 'Invalid authorization header format',
                    error: 'Unauthorized'
                });
            }

            const token = authHeader.slice(7);
            if (!token) {
                throw new UnauthorizedException({
                    statusCode: 401,
                    message: 'Access token is required',
                    error: 'Unauthorized',
                });
            }

            return token;
        }

        const cookieToken = request.cookies?.access_token as string | undefined;
        if (!cookieToken) {
            throw new UnauthorizedException({
                statusCode: 401,
                message: 'Access token is required',
                error: 'Unauthorized'
            });
        }

        return cookieToken;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        try {

            const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
                secret: this.accessSecret
            });

            if (!payload || typeof payload.sub !== 'number') {
                throw new UnauthorizedException({
                    statusCode: 401,
                    message: 'Invalid access token',
                    error: 'Unauthorized'
                });
            }

            (request as RequestWithUser).user = payload;
            return true;

        } catch (error) {
            if( error instanceof TokenExpiredError ) {
                throw new UnauthorizedException({
                    statusCode: 401,
                    message: 'Access token expired',
                    error: 'Unauthorized'
                });
            }

            if (error instanceof JsonWebTokenError) {
                throw new UnauthorizedException({
                    statusCode: 401,
                    message: 'Invalid access token',
                    error: 'Unauthorized'
                });
            }

            throw error;

        }

    }

}