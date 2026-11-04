import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, TokenExpiredError, JsonWebTokenError } from "@nestjs/jwt";
import { ConfigService } from '@nestjs/config';
import { Request } from "express";

@Injectable()
export class AccessTokenGuard implements CanActivate {

    constructor(
        private readonly jwtService:JwtService,
        private readonly config:ConfigService
    ){}

    private get accessSecret():string {
        return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const authHeader = request.headers.authorization;

         if ( !authHeader ) {
            throw new UnauthorizedException({
                statusCode: 401,
                message: 'Access token is required',
                error: 'Unauthorized'
            });
        }

        if( !authHeader?.startsWith('Bearer ') ) {
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

        try {

            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.accessSecret
            });
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