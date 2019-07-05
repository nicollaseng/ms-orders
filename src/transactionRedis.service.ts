import { Injectable, Inject, Logger } from '@nestjs/common';
import { RedisClient } from 'redis';

@Injectable()
export class TransactionRedisService {
  constructor(
    @Inject('REDIS_CONNECTION') private readonly redisClient: RedisClient,
  ) {}

  private TTL: string = process.env.TTL_REDIS || '5000';

  checkIfExists(userId) {
    return new Promise((resolve, reject) => {
      this.redisClient.exists(`${userId}_transaction`, (err, res) => {
        if (err) reject(err.message);
        Logger.log(
          `response of redis exists: ${res}`,
          'TransactionRedisService.checkIfExists',
        );
        if (res === 1) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
