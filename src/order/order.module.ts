import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deposits } from './entity/deposits.entity';
import { Orders } from './entity/orders.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { ExecutedOrders } from './entity/executed-orders.entity';
import { User } from './entity/user.entity';
import { DefaultFee } from './entity/default_fees.entity';
import { CustomFee } from './entity/custom_fees.entity';
import { OrderExecutionService } from './orderExecution.service';
import { Trades } from './entity/trades.entity';
import { createClient } from 'redis';
import { Transactions } from './entity/transaction.entity';
import { BridgeOrders } from './entity/bridge-orders.entity';
import { TransactionRedisService } from '../transactionRedis.service';

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort: any = process.env.REDIS_PORT || 6379;
const redisPass = process.env.REDIS_PASS;

const ormModules = [
  Deposits,
  Orders,
  ExecutedOrders,
  User,
  DefaultFee,
  CustomFee,
  Trades,
  Transactions,
  BridgeOrders,
];

@Module({
  providers: [
    OrderService,
    OrderExecutionService,
    TransactionRedisService,
    {
      provide: 'RedisConnection',
      useFactory: async () => {
        return createClient({
          host: redisHost,
          port: redisPort,
          password: redisPass,
        });
      },
    },
  ],
  controllers: [OrderController],
  imports: [TypeOrmModule.forFeature(ormModules)],
})
export class OrdersModule {}
