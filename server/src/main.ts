import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(); // 跨域

  await app.listen(process.env.PORT ?? 3001);
  //不与前端端口冲突
}
bootstrap();
