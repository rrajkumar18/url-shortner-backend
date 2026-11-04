import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@Controller()
@ApiTags('App')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({summary:'Health Check'})
  @ApiResponse({status: 200, summary:'Service is UP'})
  getHealth() {
    return { status: 'UP' };
  }
}
