import { Module, Global } from '@nestjs/common';
import { Transport, ClientProxyFactory } from '@nestjs/microservices';

const natsHost = process.env.NATS_HOST || 'localhost';
const natsPort = process.env.NATS_PORT || 4222;

const natsFactory = {
  provide: 'NATS_CONNECTION',
  useFactory: () => {
    const options: any = {
      transport: Transport.NATS,
      options: {
        url: `nats://${natsHost}:${natsPort}`,
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASS,
      },
    };
    return ClientProxyFactory.create(options);
  },
};

@Global()
@Module({
  providers: [natsFactory],
  exports: [natsFactory],
})
export class NatsModule {}
