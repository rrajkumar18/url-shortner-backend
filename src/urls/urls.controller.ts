import { Controller, Get, Body, Param, Post, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { UrlsService } from './urls.service.js';
import { CreateUrlDto } from './dto/create-url.dto.js';

@Controller('urls')
@ApiTags('URL')
export class UrlsController {

    constructor( private urlsService:UrlsService ) {

    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({summary:'Create a short URL for your Long URL'})
    @ApiResponse({status: 200, summary:'Short URL created'})
    @Throttle({
        default : {
            limit: 10,
            ttl: 60_000
        }
    })
    create(@Body() dto:CreateUrlDto) {
        return this.urlsService.create(dto.originalUrl);
    }

    @Get(':code')
    async redirect( @Param('code') code:string, @Res() res:Response ) {
        const orgUrl = await this.urlsService.findOriginalUrl(code);
        return res.redirect(302, orgUrl);
    }

    @Get('metrics/cache')
    @ApiBearerAuth('access-token')
    cacheMetrics() {
        return this.urlsService.getCacheStats();
    }

    @Get(':code/stats')
    async getStats(@Param('code') code: string) {
        return this.urlsService.getStats(code);
    }

}
