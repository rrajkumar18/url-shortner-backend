import { Controller, Body, Post, HttpCode, HttpStatus, Res, Req, UnauthorizedException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDTO } from './dto/login.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {

    private readonly cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    constructor(
        private readonly auth:AuthService,
        private readonly config:ConfigService
    ){}

    private accessCookieOptions() {
        return {
            ...this.cookieOptions,
            path: '/',
            maxAge: Number(this.config.getOrThrow<string>('JWT_ACCESS_TTL')),
        };
    }

    private refreshCookieOptions() {
        return {
            ...this.cookieOptions,
            maxAge: Number(this.config.getOrThrow<string>('JWT_REFRESH_DAYS')),
        };
    }

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({summary:'Register a new user'})
    @ApiResponse({status:201, description:'Users registered successfully'})
    @ApiResponse({status: 400, description: 'Invalid registration data' })
    @ApiResponse({status: 409, description: 'User already exists' })
    @ApiResponse({status: 500, description: 'Internal server error' })
    async register(@Body() dto:RegisterDto) {
        try {
            return await this.auth.registerUser(dto);
        } catch ( err ) {
            console.log("error creating user", err instanceof Error ? err.stack : String(err));
            if (err instanceof HttpException) {
                throw err;
            }

            throw new InternalServerErrorException(
                'Unable to register user. Please try again later.',
            );
        }
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary:'Login the user'})
    @ApiResponse({status:200, description:'Login SUccessfull'})
    async login(@Body() dto:LoginDTO, @Res({passthrough:true}) res: Response) {
        const result = await this.auth.loginUser(dto);
        res.cookie('refresh_token', result.refreshToken, this.refreshCookieOptions());
        res.cookie('access_token', result.accessToken, this.accessCookieOptions());
        return {
            message: result.message,
            user: result.user
        };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() req:Request, @Res({passthrough:true}) res:Response ) {
        const token = req.cookies?.refresh_token as string | undefined;
        if( !token ) {
            throw new UnauthorizedException('Refresh token required');
        }
        const result = await this.auth.refreshTokens(token);        
        res.cookie('refresh_token', result.refreshToken, this.refreshCookieOptions());
        res.cookie('access_token', result.accessToken, this.accessCookieOptions());
        return {
            message: 'success'
        };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary:'User Logout'})
    @ApiResponse({status:200, description:'Logout Successfull'})
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const token = req.cookies?.refresh_token as string | undefined;
        await this.auth.logoutUser(token ?? '');

        res.clearCookie('refresh_token', this.refreshCookieOptions());
        res.clearCookie('access_token', this.accessCookieOptions());

        return { message: 'Logged out successfully from backend' };
    }

}