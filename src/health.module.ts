import { Module } from '@nestjs/common';
import {
  TerminusModule,
  TerminusModuleOptions,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';

const natsHost = process.env.NATS_HOST || 'nats';
const natsPort = process.env.NATS_PORT || 4222;

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort: any = process.env.REDIS_PORT || 6379;
const redisPass = process.env.REDIS_PASS;

const options: any = {
  transport: Transport.NATS,
  options: {
    url: `nats://${natsHost}:${natsPort}`,
    queue: 'ms-orders',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  },
};

const getTerminusOptions = (
  microservice: MicroserviceHealthIndicator,
): TerminusModuleOptions => ({
  endpoints: [
    {
      url: '/health',
      healthIndicators: [async () => microservice.pingCheck('nats', options)],
    },
  ],
});

@Module({
  imports: [
    TerminusModule.forRootAsync({
      inject: [MicroserviceHealthIndicator],
      useFactory: getTerminusOptions,
    }),
  ],
})
export class HealthModule {}
