/*
 * @Author: shaoliye
 * @Date: 2026-04-27 15:50:56
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-06 12:07:53
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ConfiguredSocketIoAdapter } from './common/websocket/configured-socket-io.adapter';

// 启动 Nest 应用并注册全局中间能力。
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const apiPrefix = configService.get<string>('SERVER_API_PREFIX', 'api/v1');
  const port = configService.get<number>('PORT', 3001);
  const webOrigins = configService.get<string[]>('WEB_ORIGINS', [
    'http://localhost:3000',
  ]);

  app.enableCors({ origin: webOrigins, credentials: true });
  app.useWebSocketAdapter(new ConfiguredSocketIoAdapter(app, webOrigins));
  app.setGlobalPrefix(apiPrefix);

  // 全局异常过滤器（在拦截器之前注册，保证异常时也能统一格式）
  app.useGlobalFilters(new AllExceptionsFilter());
  // 全局 DTO 校验管道，阻止未声明字段进入业务层。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: createValidationException,
    }),
  );
  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NextNest API')
    .setDescription('NextNest backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(port);
  logger.log(`Server is running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger is running on http://localhost:${port}/api-docs`);
}

// 将 class-validator 的嵌套错误树压平成 BadRequestException。
function createValidationException(errors: ValidationError[]) {
  const messages = flattenValidationErrors(errors);

  return new BadRequestException(
    messages.length > 0 ? messages : ['Request validation failed'],
  );
}

// 递归提取 DTO 校验错误，输出稳定可读的字段级错误信息。
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const propertyPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const constraints = error.constraints
      ? Object.values(error.constraints).map(
          (message) => `${propertyPath}: ${message}`,
        )
      : [];
    const childMessages = error.children?.length
      ? flattenValidationErrors(error.children, propertyPath)
      : [];

    return [...constraints, ...childMessages];
  });
}

void bootstrap();
