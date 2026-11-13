import { Controller, Get, Body, Param, Post, Query, Req, Res, HttpCode, HttpStatus, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UrlsService } from './urls.service.js';
import { CreateUrlDto } from './dto/create-url.dto.js';
import { OptionalAccessTokenGuard } from '../auth/guards/optional-access-token.guard.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { RequestWithUser } from '../auth/guards/access-token.guard.js';
import type { Response } from 'express';
import { Observable } from 'rxjs';

@Controller('urls')
@ApiTags('URL')
export class UrlsController {

    constructor( private urlsService:UrlsService ) {

    }

    @Post()
    @UseGuards(OptionalAccessTokenGuard)
    @ApiBearerAuth('access-token')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({summary:'Create a short URL for your Long URL'})
    @ApiResponse({status: 200, summary:'Short URL created'})
    @Throttle({
        default : {
            limit: 10,
            ttl: 60_000
        }
    })
    create(@Body() dto: CreateUrlDto, @Req() req: RequestWithUser) {
        return this.urlsService.create(dto.originalUrl, req.user?.sub);
    }

    @Get(':code')
    async redirect( @Param('code') code:string, @Res() res:Response ) {
        const orgUrl = await this.urlsService.findOriginalUrl(code);
        return res.redirect(302, orgUrl);
    }

    @Get('metrics/cache')
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth('access-token')
    cacheMetrics() {
        return this.urlsService.getCacheStats();
    }

    @Get(':code/stats')
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({summary:'Get stats of particular URL'})
    @ApiResponse({status: 200, description: 'Stats retrieved successfully'})
    async getStats(@Param('code') code: string) {
        return this.urlsService.getStats(code);
    }

    @Get()
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({summary:'Get all shortened URLs with pagination'})
    @ApiResponse({status: 200, description: 'List of URLs retrieved successfully'})
    async getAllLinks(@Req() req:RequestWithUser, @Query('page') page?:string, @Query('limit') limit?:string) {
        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(20, Math.max(1, Number(limit) || 20));        
        const response = await this.urlsService.getAllLinks(req.user?.sub, currentPage, currentLimit);
        return response.data.map(({ redirectCount, shortCode, ...rest }) => ({
            ...rest,
            shortCode,
            shortUrl: `${req.protocol}://${req.get('host')}/urls/${shortCode}`,
            clicks: redirectCount,
            status: 'Active'
        }));
    }

    @Get('stats/dashboard')
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({summary:'Get Dashboard stats'})
    @ApiResponse({status: 200, description: 'Returned dashboard stats'})
    async getDashboardStats(@Req() req: RequestWithUser) {
        return this.urlsService.getDashboardStats(req.user?.sub);
    }

    @Sse('stats/clicks')
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({summary:'Subscribe user to click events'})
    @ApiResponse({status: 200, description: 'User successfully subscribed'})
    realtimeClicks(@Req() req:RequestWithUser):Observable<MessageEvent> {
        const userId = req.user?.sub as number;
        const res =  this.urlsService.subscribeToUserClicks(userId);        
        return res;
    }

}
