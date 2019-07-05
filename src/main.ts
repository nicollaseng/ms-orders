if (process.env.APM_ENABLE) {
  // tslint:disable-next-line:no-var-requires
  require('raven')
    .config('https://ceb59fa5f4224720ad2c9306598cf73c@sentry.btcbolsa.host/4')
    .install();

  // tslint:disable-next-line:no-var-requires
  require('elastic-apm-node').start({
    serviceName: 'ms-orders',
    serverUrl: process.env.APM_HOST,
  });
}

import './tracer';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

const natsHost = process.env.NATS_HOST || 'nats';
const natsPort = process.env.NATS_PORT || 4222;

const options: any = {
  transport: Transport.NATS,
  options: {
    url: `nats://${natsHost}:${natsPort}`,
    queue: 'ms-orders',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  },
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice(options);

  app.useGlobalPipes(new ValidationPipe());

  await app.startAllMicroservicesAsync();
  await app.listen(3000);
}
bootstrap();
