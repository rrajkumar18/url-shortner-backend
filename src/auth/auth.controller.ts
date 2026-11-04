import { Controller, Body, Post, HttpCode, HttpStatus, Res, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
        private readonly auth:AuthService
    ){}

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({summary:'Register a new user'})
    @ApiResponse({status:200, description:'Users registered successfully'})
    async register(@Body() dto:RegisterDto) {
        return await this.auth.registerUser(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary:'Login the user'})
    @ApiResponse({status:200, description:'Login SUccessfull'})
    async login(@Body() dto:LoginDTO, @Res({passthrough:true}) res: Response) {
        const result = await this.auth.loginUser(dto);
        res.cookie('refresh_token', result.refreshToken, this.cookieOptions);
        return {
            message: result.message,
            accessToken: result.accessToken,
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
        res.cookie('refresh_token', result.refreshToken, this.cookieOptions);
        return { accessToken: result.accessToken };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({summary:'User Logout'})
    @ApiResponse({status:200, description:'Logout Successfull'})
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const token = req.cookies?.refresh_token as string | undefined;
        await this.auth.logoutUser(token ?? '');

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            // sameSite: 'none',
            path: '/auth',
        });

        return { message: 'Logged out successfully' };
    }

}