import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { OptionalAccessTokenGuard } from './guards/optional-access-token.guard.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.register({}),
    // JwtModule.registerAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (config:ConfigService) => ({
    //     secret: config.getOrThrow<string>('JWT_SECRET'),
    //     signOptions: {
    //       expiresIn: '15m'
    //     }
    //   })
    // })
  ],
  providers: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard],
  controllers: [AuthController],
  exports: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard, JwtModule]
})
export class AuthModule {}
