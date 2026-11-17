import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule, ObserveInstrument } from './app.module.js';

const logger = new Logger('Bootstrap');

async function bootstrap() {
    try {
        logger.log('1. Starting NestJS application...');
        const app = await NestFactory.create(AppModule, {
            instrument: ObserveInstrument,
        });

        logger.log('2. NestJS application created successfully');
        app.enableCors({
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        });

        logger.log('3. CORS configured');
        app.use(cookieParser());

        logger.log('4. Cookie parser configured');
        const config = new DocumentBuilder()
            .setTitle('URL Shortner Backend')
            .setDescription('API documentation')
            .setVersion('1.0')
            .addBearerAuth({
                type: 'http',
                scheme: 'Bearer',
                bearerFormat: 'JWT',
                description: 'Enter your Access Token'
            }, 'access-token')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('docs', app, document);

        logger.log('5. Swagger configured');
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true
            })
        );

        logger.log('6. Validation pipes configured');
        const port = process.env.PORT || 3000;
        await app.listen(port, '0.0.0.0');

        logger.log(`7. Application listening on port ${port}`);
    } catch (error) {
        logger.error('APPLICATION STARTUP FAILED');
        logger.error(error instanceof Error ? error.stack : String(error));
        process.exit(1);
    }
}

process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED REJECTION');
    logger.error(reason instanceof Error ? reason.stack : String(reason));
});

process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT EXCEPTION');
    logger.error(error.stack);
    process.exit(1);
});

bootstrap();
