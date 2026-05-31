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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// 启动 Nest 应用并注册全局中间能力。
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(); // 跨域

  // 全局异常过滤器（在拦截器之前注册，保证异常时也能统一格式）
  app.useGlobalFilters(new AllExceptionsFilter());
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

  await app.listen(process.env.PORT ?? 3001);
  //不与前端端口冲突
}

bootstrap();
