import { createClient } from 'redis';
import { Global, Module } from '@nestjs/common';

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort: any = process.env.REDIS_PORT || 6379;
const redisPass = process.env.REDIS_PASS;

const factory = {
  provide: 'REDIS_CONNECTION',
  useFactory: async () => {
    return createClient({
      host: redisHost,
      port: redisPort,
      password: redisPass,
    });
  },
};

@Global()
@Module({
  providers: [factory],
  exports: [factory],
})
export class RedisModule {}
