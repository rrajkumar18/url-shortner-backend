import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { createSessionId, hashRefreshToken } from './auth-tokens.js';
import { Prisma } from '../generated/prisma/client.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDTO } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import { StringValue } from 'ms';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {

    constructor(
        private readonly prisma:PrismaService,
        private readonly jwtService:JwtService,
        private readonly config:ConfigService
    ){}

    private get accessSecret():string {
        return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    }

    private get accessTTL():string {
        return this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    }

    private get refreshTTL():string {
        return this.config.getOrThrow<string>('JWT_REFRESH_DAYS');
    }

    private get refreshSecret():string {
        return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    }

    private async issueTokens(user:{id:number;email:string;}, sessionId:string) {
        const payload = {
            sub: user.id,
            email: user.email,
            sid: sessionId
        };

        const accessToken = await this.jwtService.signAsync(
            {sub: user.id, email:user.email},
            {secret: this.accessSecret, expiresIn: this.accessTTL as StringValue}
        );

        const refreshToken = await this.jwtService.signAsync(payload,{
            secret: this.refreshSecret,
            expiresIn: this.refreshTTL as StringValue
        });

        return { accessToken, refreshToken };
    }

    async registerUser(dto:RegisterDto) {
        const hashPassword = await argon2.hash(dto.password, { type:argon2.argon2id});
        try {
            const user = await this.prisma.user.create({
                data: {
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    email: dto.email,
                    passwordHash: hashPassword
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    createdAt: true
                }
            });
            return {
                message : 'Account created successfully',
                user
            };
        } catch ( error:unknown ) {
            if( error instanceof Prisma.PrismaClientKnownRequestError && error.code == 'P2002' ) {
                throw new ConflictException('An account with this email already exists');
            }
            throw error;
        }
    }

    async loginUser(dto:LoginDTO) {
        const user = await this.prisma.user.findUnique({
            where: {
                email: dto.email
            }
        });

        if( !user || !(await argon2.verify(user.passwordHash, dto.password)) ) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const sessionId = createSessionId();
        const { accessToken, refreshToken } = await this.issueTokens(user, sessionId);
        const expiresAt = new Date(
            Date.now() + Number(this.refreshTTL) * 24 * 60 * 60 * 1000,
        );

        await this.prisma.authSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshTokenHash: hashRefreshToken(refreshToken),
                expiresAt
            }
        });

        return {
            message: 'Login successful',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
            },
        };
    }

    async logoutUser(refreshToken: string) {

        if (!refreshToken) {
            return { message: 'Logged out' };
        }

        let payload: { sub: number; sid: string };

        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: this.refreshSecret,
            });
        } catch {
            // Logout remains idempotent if the token is expired or invalid.
            return { message: 'Logged out' };
        }

        if (
            typeof payload.sub !== 'number' ||
            typeof payload.sid !== 'string'
        ) {
            return { message: 'Logged out' };
        }

        await this.prisma.authSession.updateMany({
            where: {
                id: payload.sid,
                userId: payload.sub,
                refreshTokenHash: hashRefreshToken(refreshToken),
                revokedAt: null,
            },
            data: { revokedAt: new Date() },
        });

        return { message: 'Logged out' };
    }

    async refreshTokens(refreshToken:string) {
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token required');
        }

        let payload: { sub: number; email: string; sid: string };

        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: this.refreshSecret
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (
            !payload ||
            typeof payload.sub !== 'number' ||
            typeof payload.sid !== 'string'
        ) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const oldHash = hashRefreshToken(refreshToken);

        const session = await this.prisma.authSession.findUnique({
            where: { id: payload.sid },
            include: { user: true },
        });

        if (
            !session ||
            session.userId !== payload.sub ||
            session.revokedAt ||
            session.expiresAt <= new Date() ||
            session.refreshTokenHash !== oldHash
        ) {
            throw new UnauthorizedException('Invalid or expired session');
        }

        const { accessToken, refreshToken: newRefreshToken } = await this.issueTokens(session.user, session.id);
        
        const result = await this.prisma.authSession.updateMany({
            where: {
                id: session.id,
                refreshTokenHash: oldHash,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            data: {
                refreshTokenHash: hashRefreshToken(newRefreshToken),
            },
        });

        if (result.count !== 1) {
            throw new UnauthorizedException('Refresh token already used');
        }

        return { accessToken, refreshToken: newRefreshToken };
    }

}
