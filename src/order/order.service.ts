import { ExecutedOrders } from './entity/executed-orders.entity';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import {
  SendDepositDTO,
  OrdersDTO,
  ExtractDTO,
  OrderDeleteDTO,
  UpdateDepositDTO,
  PlaceOrderDTO,
} from './dto/orders.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { User } from './entity/user.entity';
import { Deposits } from './entity/deposits.entity';
import { Orders } from './entity/orders.entity';
import { Repository, MoreThan, getManager } from 'typeorm';
import * as moment from 'moment';
import { Trades } from './entity/trades.entity';
import { RedisClient } from 'redis';
import { countDecimals } from '../utils/countDecimals';
import * as math from 'mathjs';
import { ICoin } from '../interface/ICoin';
import { IPair } from '../interface/IPair';
import { Transactions } from './entity/transaction.entity';
import { BridgeOrders } from './entity/bridge-orders.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Deposits)
    private readonly depositRepository: Repository<Deposits>,
    @InjectRepository(Orders)
    private readonly orderRepository: Repository<Orders>,
    @InjectRepository(ExecutedOrders)
    private readonly executedOrdersRepository: Repository<ExecutedOrders>,
    @InjectRepository(Trades)
    private readonly tradesRepository: Repository<Trades>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(BridgeOrders)
    private readonly bridgeOrdersRepository: Repository<BridgeOrders>,
    @Inject('NATS_CONNECTION')
    private readonly clientProxy: ClientProxy,
    @Inject('RedisConnection') private readonly redisClient: RedisClient,
  ) {}

  getRedisPairs(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.redisClient.lrange('avaiable_pairs', 0, -1, (err, value) => {
        if (err) {
          reject(err);
        }
        resolve(value);
      });
    });
  }

  getRedisPairsConfiguration(pair: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.redisClient.hgetall(pair, (err, result) => {
        if (err) reject(err);
        resolve(result);
      });
    });
  }

  getRedisCoins(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.redisClient.lrange('avaiable_coins', 0, -1, (err, value) => {
        if (err) {
          reject(err);
        }
        resolve(value);
      });
    });
  }

  private getRedisCoinsConfigurations(coin: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.redisClient.hgetall(`coin_${coin}`, (err, result) => {
        if (err) reject('Erro ao encontrar moeda');
        resolve(result);
      });
    });
  }

  async getAllAvailablePairs() {
    const pairs = await this.getRedisPairs();

    try {
      const pairConfiguration = await Promise.all(
        pairs.map(
          async item =>
            await this.getRedisPairsConfiguration(item.toLowerCase()),
        ),
      );

      return {
        success: true,
        data: pairConfiguration,
      };
    } catch (err) {
      throw new RpcException('Erro ao recuperar os pares disponiveis');
    }
  }

  async getAllAvailableCoins() {
    const availableCoins = await this.getRedisCoins();

    try {
      const coins: Array<ICoin> = await Promise.all(
        availableCoins.map(async coin => {
          return await this.getRedisCoinsConfigurations(coin);
        }),
      );

      return {
        success: true,
        data: coins,
      };
    } catch (err) {
      throw new RpcException('Erro ao recuperar as moedas disponiveis');
    }
  }

  async getExtract(params: ExtractDTO) {
    const orders = await this.executedOrdersRepository.find({
      where: { currency: params.currency },
    });

    return {
      success: true,
      data: orders,
    };
  }

  async getAllOrders(params: OrdersDTO) {
    const orders = await this.orderRepository.find({
      where: {
        user_id: params.userId,
      },
    });

    const state = order => {
      if (order.del === 1) {
        return 'deleted';
      }

      if (order.done === 1) {
        return 'executed_int';
      }

      if (
        order.done === 0 &&
        order.del === 0 &&
        order.amount < order.amount_source
      ) {
        return 'executed_partially';
      }

      if (
        order.done === 0 &&
        order.del === 0 &&
        order.amount === order.amount_source
      ) {
        return 'pending';
      }

      return '';
    };

    const data = orders.map(order => ({
      identificator: order.identificator,
      side: order.side,
      time: order.time,
      done: order.done,
      initial_amount: order.amount_source,
      avaliable_amount: order.amount,
      price_unity: order.price_unity,
      pair: order.pair,
      state: state(order),
    }));

    return {
      success: true,
      data,
    };
  }

  async updateDeposit(data: UpdateDepositDTO) {
    const deposit = await this.depositRepository.findOne({
      where: { identificator: data.identificator },
    });

    if (!deposit) {
      throw new RpcException('Falha ao encontrar o depósito');
    }

    deposit.receipt = data.receipt;

    deposit.save();

    return {
      success: true,
    };
  }

  async validateCoinAvailable({ coin }) {
    let getCoins;
    let getCoin: ICoin;

    try {
      getCoins = await this.getRedisCoins();
    } catch (err) {
      throw new RpcException(err);
    }

    if (!getCoins.includes(coin.toLowerCase())) {
      throw new RpcException('Moeda indisponível');
    }

    try {
      getCoin = await this.getRedisCoinsConfigurations(coin.toLowerCase());
    } catch (err) {
      throw new RpcException(err);
    }

    if (parseFloat(getCoin.active) === 0) {
      throw new RpcException('Moeda indisponível');
    }

    return {
      success: true,
      data: getCoin,
    };
  }

  async validatePairAvailable({ pair }) {
    let getPairs;
    let getPair: IPair;

    try {
      getPairs = await this.getRedisPairs();
    } catch (err) {
      throw new RpcException(err);
    }

    if (!getPairs.includes(pair)) {
      throw new RpcException('Par indisponível');
    }

    try {
      getPair = await this.getRedisPairsConfiguration(pair);
    } catch (err) {
      throw new RpcException(err);
    }

    if (parseFloat(getPair.active) === 0) {
      throw new RpcException('Par indisponível');
    }

    return {
      success: true,
      data: getPair,
    };
  }

  async sendDeposit(data: SendDepositDTO) {
    const { user } = await this.clientProxy
      .send({ cmd: 'get_user_info' }, { userId: data.userId })
      .toPromise()
      .catch(err => {
        throw new RpcException(err.message);
      });

    if (user.verified === 0) {
      throw new RpcException('Conta não verificada');
    }

    if (user.blocked === 1) {
      throw new RpcException('Conta bloqueada');
    }

    try {
      await this.validateCoinAvailable({ coin: 'brl' });
    } catch (err) {
      throw new RpcException(err.message);
    }

    const endTime = moment();
    const userDeposit = await this.depositRepository.find({
      where: { user_id: data.userId, currency: 'BRL' },
    });

    // verifica se o usuário tem algum deposito com menos de 10 minutos
    const hasUserDeposited = userDeposit.some(item => {
      const startTime = moment(item.time);
      const duration = moment.duration(endTime.diff(startTime));
      const minutes = duration.asMinutes();
      if (minutes > 10) {
        return false;
      }

      return true;
    });

    // se o depósito do usuário não passou de 1 minuto, retorna erro
    if (hasUserDeposited) {
      throw new RpcException(
        'Aguarde 10 minutos para fazer um novo depósito de REAL',
      );
    }

    // check user limit
    await this.clientProxy
      .send(
        { cmd: 'validate_user_limit' },
        {
          currency: 'BRL',
          userId: data.userId,
          type: 'deposit',
          value: data.amount,
        },
      )
      .toPromise()
      .catch(err => {
        throw new RpcException(err.message);
      });

    const deposit = await this.depositRepository
      .create({
        amount: data.amount,
        liquid_amount: data.amount,
        fee: 0,
        type: data.type,
        user_id: data.userId,
        currency: 'BRL', // default
        done: 0,
        time: moment().format(),
      })
      .save();

    const historyData = {
      is_financial: 1,
      user_ip: data.userIp,
      user_id: data.userId,
      user_agent: data.userAgent,
      currency: 'BRL',
      type: 'deposit_created',
      description: 'Depósito criado com sucesso',
      amount: data.amount,
      item_id: deposit.id,
    };

    await this.clientProxy
      .send({ cmd: 'save_history' }, historyData)
      .toPromise()
      .catch(err => {
        // do nothing
      });

    const emailQueueData = {
      type: 'deposit_created',
      information: JSON.stringify({ id: deposit.id }),
      user_id: data.userId,
    };

    await this.clientProxy
      .send({ cmd: 'save_email_queue' }, emailQueueData)
      .toPromise()
      .catch(err => {
        // do nothing
      });

    return {
      success: true,
    };
  }

  async ordersExecutedGetInfo(pair) {
    const totalExecuted = await this.executedOrdersRepository.query(`
            SELECT sum(amount_executed) as total_executed
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
        `);

    const totalTrades = await this.executedOrdersRepository.query(`
            SELECT COUNT(*) as total_trades
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
            AND pair = '${pair}'
        `);

    const lastOrder = await this.executedOrdersRepository.query(`
            SELECT price_unity as price
            FROM executed_orders
            WHERE pair = '${pair}'
            ORDER BY time_executed desc
            limit 1
        `);

    const firstOrder = await this.executedOrdersRepository.query(`
            SELECT price_unity as price
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
            AND pair = '${pair}'
            ORDER BY time_executed asc
            limit 1
        `);

    const highestOrders = await this.orderRepository.query(`
            SELECT price_unity as high_price
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
            AND pair = '${pair}'
            ORDER BY price_unity desc
            limit 1
        `);

    const lowestOrders = await this.orderRepository.query(`
            SELECT price_unity as low_price
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
            AND pair = '${pair}'
            ORDER BY price_unity asc
            limit 1
        `);

    const volumeOrders = await this.orderRepository.query(`
            SELECT sum(amount_executed) as amount_executed
            FROM executed_orders
            WHERE time_executed >= now() - INTERVAL '1 DAY'
            AND pair = '${pair}'
        `);

    const lastPrice = lastOrder.length > 0 ? lastOrder[0].price : 0;
    const firstPrice = firstOrder.length > 0 ? firstOrder[0].price : 0;
    const varType = lastPrice >= firstPrice ? 'up' : 'down';

    const var24 = Math.abs((lastPrice / firstPrice) * 100 - 100);

    return {
      success: true,
      total_executed: totalExecuted[0].total_executed
        ? totalExecuted[0].total_executed
        : 0,
      total_trades: totalTrades[0].total_trades
        ? totalTrades[0].total_trades
        : 0,
      last: lastPrice,
      high: highestOrders.length > 0 ? highestOrders[0].high_price : 0,
      low: lowestOrders.length > 0 ? lowestOrders[0].low_price : 0,
      volume: volumeOrders[0].amount_executed
        ? volumeOrders[0].amount_executed
        : 0,
      var_type: varType,
      var_24: var24 ? var24 : 0,
    };
  }

  async orderDelete(data: OrderDeleteDTO) {
    Logger.log(
      `Deletando ordem do usuário #${data.userId}`,
      'OrdersService.orderDelete',
      true,
    );

    const order = await this.orderRepository.findOne({
      where: {
        identificator: data.orderIdentificator,
        del: 0,
        done: 0,
        amount: MoreThan(0),
        locked: 0,
      },
      relations: ['user'],
    });

    if (!order) {
      throw new RpcException(
        'Falha ao encontrar ordem, ordem já cancelada ou já executada',
      );
    }

    if (order.user_id !== data.userId) {
      throw new RpcException('Falha ao excluir ordem');
    }

    if (order.user.blocked === 1) {
      throw new RpcException('Conta do usuário bloqueada');
    }

    try {
      const pair = order.pair.replace('/', '_').toLowerCase();
      await this.validatePairAvailable({ pair });
    } catch (err) {
      throw new RpcException(err.message);
    }

    const currencies = order.pair.split('/');

    const target_asset = currencies[0];
    const base_asset = currencies[1];

    try {
      await this.validateCoinAvailable({ coin: target_asset });
      await this.validateCoinAvailable({ coin: base_asset });
    } catch (err) {
      throw new RpcException(err.message);
    }

    const total = math.round(math.multiply(order.amount, order.price_unity), 2);

    let orderTransaction: Transactions;

    if (order.side === 'buy') {
      orderTransaction = await this.transactionsRepository.create({
        user_id: order.user_id,
        coin: 'brl',
        amount: total,
        type: 'order_deleted',
        item_id: order.id,
        is_retention: 1,
      });
    } else {
      orderTransaction = await this.transactionsRepository.create({
        user_id: order.user_id,
        coin: order.pair.split('/')[0].toLowerCase(),
        amount: math.round(order.amount, 8),
        type: 'order_deleted',
        item_id: order.id,
        is_retention: 1,
      });
    }

    order.time_del = moment().format();
    order.del = 1;

    this.fixOrderTotal(order);

    try {
      await getManager().transaction(async transactionalEntityManager => {
        await transactionalEntityManager.save(order);
        await transactionalEntityManager.save(orderTransaction);
      });

      const orderDeleted = {
        orderIdentificator: order.identificator,
        user_id: order.user.uid,
        pair: order.pair,
        side: order.side,
        amount: order.amount,
        price: order.price_unity,
      };

      return {
        success: true,
        orderDeleted,
        pair: order.pair,
      };
    } catch (err) {
      Logger.log(err.message, 'OrderService.orderDelete', true);
      throw new RpcException('Ocorreu um erro na operação');
    }
  }

  async getTrades(pair) {
    const orders = await this.tradesRepository.find({
      where: { pair },
      order: { time_executed: 'DESC' },
      take: 50,
    });

    const trades = orders.map(order => ({
      amount: order.amount_executed,
      price_unity: order.price_unity,
      time_executed: order.time_executed,
      user_id_active: order.user_id_active,
      user_id_passive: order.user_id_passive,
      side: order.side,
    }));

    const data = {
      [pair]: {
        trades,
      },
    };

    return data;
  }

  async getTradesApi(pair) {
    pair = pair.toUpperCase().replace('_', '/');

    const trades = await this.tradesRepository.find({
      select: ['time_executed', 'amount_executed', 'price_unity', 'side'],
      where: {
        pair,
        done: 1,
        del: 0,
      },
      order: {
        time_executed: 'DESC',
      },
      take: 50,
    });

    const data = trades.map(item => ({
      type: item.side,
      amount: parseFloat(item.amount_executed.toString()),
      price_unity: parseFloat(item.price_unity.toString()),
      timestamp: item.time_executed,
    }));

    return {
      success: true,
      data,
    };
  }

  async getTicker(pair) {
    pair = pair.toUpperCase().replace('_', '/');
    const { buy, sell } = await this.clientProxy
      .send({ cmd: 'buy_sell_orders' }, { pair })
      .toPromise();

    const {
      total_trades,
      total_executed,
      last,
      low,
      high,
      volume,
      var_type,
      var_24,
    } = await this.clientProxy
      .send({ cmd: 'order_executed_get_info' }, { pair })
      .toPromise();

    return {
      pair,
      buy,
      sell,
      total_trades,
      total_executed,
      high,
      low,
      last,
      volume,
      var_type,
      var_24,
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss.mmm'),
    };
  }

  async getTickerApi(pair) {
    pair = pair.toUpperCase().replace('_', '/');
    const { buy, sell } = await this.clientProxy
      .send({ cmd: 'buy_sell_orders' }, { pair })
      .toPromise();

    const { last, low, high, volume } = await this.clientProxy
      .send({ cmd: 'order_executed_get_info' }, { pair })
      .toPromise();

    return {
      pair,
      buy,
      sell,
      high,
      low,
      last,
      volume,
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss.mmm'),
    };
  }

  async getAllOrderBook(pair: string) {
    const ordersBuy = await this.orderRepository.find({
      where: {
        done: 0,
        del: 0,
        locked: 0,
        pair,
        side: 'buy',
      },
      order: {
        price_unity: 'DESC',
      },
      relations: ['user'],
    });

    const orderBookBuy = ordersBuy.map(order => ({
      orderIdentificator: order.identificator,
      user_id: order.user.uid,
      pair: order.pair,
      side: order.side,
      amount: order.amount,
      price: order.price_unity,
    }));

    const ordersSell = await this.orderRepository.find({
      where: {
        done: 0,
        del: 0,
        locked: 0,
        pair,
        side: 'sell',
      },
      order: {
        price_unity: 'ASC',
      },
      relations: ['user'],
    });

    const orderBookSell = ordersSell.map(order => ({
      orderIdentificator: order.identificator,
      user_id: order.user.uid,
      pair: order.pair,
      side: order.side,
      amount: order.amount,
      price: order.price_unity,
    }));

    const orderBook = [...orderBookSell, ...orderBookBuy];

    const data = {
      [pair]: {
        orderBook,
      },
    };

    return data;
  }

  async getAllOrderBookApi(pair: string) {
    pair = pair.toUpperCase().replace('_', '/');
    const asks = await this.orderRepository.find({
      select: ['price_unity', 'amount', 'time'],
      where: {
        done: 0,
        del: 0,
        pair,
        side: 'sell',
        locked: 0,
      },
      order: {
        price_unity: 'DESC',
      },
      take: 50,
    });

    const asksData = asks.map(item => ({
      price_unity: parseFloat(item.price_unity.toString()),
      amount: parseFloat(item.amount.toString()),
      timestamp: item.time,
    }));

    const bids = await this.orderRepository.find({
      select: ['price_unity', 'amount', 'time'],
      where: {
        done: 0,
        del: 0,
        pair,
        side: 'buy',
        locked: 0,
      },
      order: {
        price_unity: 'DESC',
      },
      take: 50,
    });

    const bidsData = bids.map(item => ({
      price_unity: parseFloat(item.price_unity.toString()),
      amount: parseFloat(item.amount.toString()),
      timestamp: item.time,
    }));

    const data = {
      asks: asksData,
      bids: bidsData,
    };

    return {
      success: true,
      data,
    };
  }

  async ordersBuyAndSellPrices(pair: string) {
    const availablePair: string = pair.replace('/', '_').toLowerCase();

    const avaiablePairs = await this.getRedisPairs();

    if (avaiablePairs.indexOf(availablePair) === -1) {
      return {
        success: true,
        buy: 0,
        sell: 0,
      };
    }

    const ordersBuy = await this.orderRepository.query(`
            select price_unity as buy_price
            from orders
            WHERE side = 'buy'
            and pair = '${pair}'
            and done = 0
            and del = 0
            and locked = 0
            ORDER BY price_unity desc
            LIMIT 1
        `);

    const ordersSell = await this.orderRepository.query(`
            select price_unity as sell_price
            from orders
            WHERE side = 'sell'
            and pair = '${pair}'
            and done = 0
            and del = 0
            and locked = 0
            ORDER BY price_unity asc
            LIMIT 1
        `);

    const buy = ordersBuy.length > 0 ? ordersBuy[0].buy_price : 0;
    const sell = ordersSell.length > 0 ? ordersSell[0].sell_price : 0;

    return {
      success: true,
      buy,
      sell,
    };
  }

  private async getRedisOrderLimit() {
    return new Promise(async (resolve, reject) => {
      this.redisClient.hgetall('order_limit', (err, reply) => {
        if (err) reject(err);
        resolve(reply);
      });
    });
  }

  async getOrderLimit() {
    const data = await this.getRedisOrderLimit();

    return {
      success: true,
      data: data ? data : {},
    };
  }

  private async getOrderBook(userId: number, side: string, pair: string) {
    return await this.orderRepository
      .find({
        where: {
          done: 0,
          side,
          pair,
          locked: 0,
        },
      })
      .then(orders =>
        orders.map(order => ({
          id: order.id,
          pair: order.pair,
          side: order.side,
          owner: userId === order.user_id ? 1 : 0,
          total: math.multiply(order.price_unity, order.amount),
          amount: order.amount,
          price: order.price_unity,
        })),
      );
  }

  async placeOrder(data: PlaceOrderDTO) {
    Logger.log(
      `Criando ordem do usuário #${data.userId}`,
      'OrdersService.placeOrder',
      true,
    );

    const obj: any = {};
    const currencies = data.pair.split('/');

    const target_asset = currencies[0];
    const base_asset = currencies[1];

    if (base_asset === 'BRL' && countDecimals(data.price) > 2) {
      throw new RpcException('Valor inválido');
    }

    try {
      const pair = data.pair.replace('/', '_').toLowerCase();
      await this.validatePairAvailable({ pair });
    } catch (err) {
      throw new RpcException(err.message);
    }

    try {
      await this.validateCoinAvailable({ coin: target_asset });
      await this.validateCoinAvailable({ coin: base_asset });
    } catch (err) {
      throw new RpcException(err.message);
    }

    const user = await this.userRepository.findOne({
      where: { id: data.userId },
    });

    if (!user) {
      throw new RpcException('Usuário não encontrado');
    }

    if (user.blocked === 1) {
      throw new RpcException('Conta bloqueada');
    }

    // check total
    obj.total = math.round(math.multiply(data.amount, data.price), 2);

    if (obj.total < 5) {
      throw new RpcException('Minimo de R$ 5,00');
    }

    // set help variables
    obj.orderType = data.order_type.split(' ')[0];
    obj.operationType = data.order_type.split(' ')[1];
    obj.operationMode = data.order_type.split(' ')[2];
    obj.base_asset = base_asset;
    obj.target_asset = target_asset;

    // call flow buy or sell
    if (obj.orderType === 'buy') {
      return await this.buyOperation(data, obj, user);
    } else if (obj.orderType === 'sell') {
      return await this.sellOperation(data, obj, user);
    } else throw new RpcException('Invalid order type');
  }

  private async buyOperation(data: PlaceOrderDTO, obj, user: User) {
    const balanceResponse = await this.clientProxy
      .send(
        { cmd: 'get_user_balance' },
        { userId: data.userId, currency: obj.base_asset.toLowerCase() },
      )
      .toPromise()
      .catch(err => {
        throw new RpcException(err.message);
      });

    Logger.log('buy operation', 'OrderService.buyOperation', true);
    Logger.log(
      `balanceResponse: ${balanceResponse.current_balance}`,
      'OrderService.buyOperation',
      true,
    );

    Logger.log(`objtotal: ${obj.total}`, 'OrderService.buyOperation', true);

    // check user have funds
    if (balanceResponse.current_balance < obj.total) {
      throw new RpcException('Fundos insuficientes');
    }
    try {
      const orderSaved = await this.orderRepository.create({
        done: 0,
        user_id: user.id,
        side: 'buy',
        pair: data.pair,
        price_unity: data.price,
        amount: data.amount,
        amount_source: data.amount,
        time: moment().format(),
        bridge_from: data.bridge_from || null,
        bridge_price: data.bridge_price || null,
        our_order: data.our_order || null,
        locked: 0,
        total: obj.total,
        bridge_orderid: data.bridge_orderid || null,
        del: 0,
      });

      const orderTransaction = await this.transactionsRepository.create({
        user_id: user.id,
        coin: obj.base_asset.toLowerCase(),
        amount: obj.total * -1,
        type: 'order_created_buy',
        item_id: orderSaved.id,
        is_retention: 1,
      });

      await getManager().transaction(async transactionalEntityManager => {
        await transactionalEntityManager.save(orderSaved);
        await transactionalEntityManager.save(orderTransaction);
      });

      const newOrder = {
        orderIdentificator: orderSaved.identificator,
        user_id: user.uid,
        pair: orderSaved.pair,
        side: orderSaved.side,
        amount: orderSaved.amount,
        price: orderSaved.price_unity,
      };

      return {
        success: true,
        message: 'Ordem enviada com sucesso',
        newOrder,
      };
    } catch (error) {
      Logger.log(error.message, 'OrderService.buyOperation', true);
      throw new RpcException('Ocorreu um erro na operação');
    }
  }

  private async sellOperation(data: PlaceOrderDTO, obj, user: User) {
    const balanceResponse = await this.clientProxy
      .send(
        { cmd: 'get_user_balance' },
        { userId: data.userId, currency: obj.target_asset.toLowerCase() },
      )
      .toPromise()
      .catch(err => {
        throw new RpcException(err.message);
      });

    Logger.log('sell operation', 'OrderService.sellOperation', true);
    Logger.log(
      `current_balance: ${balanceResponse.current_balance}`,
      'OrderService.sellOperation',
      true,
    );
    Logger.log(`amount: ${data.amount}`, 'OrderService.sellOperation', true);

    if (balanceResponse.current_balance < data.amount) {
      throw new RpcException('Fundos insuficientes');
    }

    try {
      const orderSaved = await this.orderRepository.create({
        done: 0,
        user_id: user.id,
        side: 'sell',
        pair: data.pair,
        price_unity: data.price,
        amount: data.amount,
        amount_source: data.amount,
        bridge_from: data.bridge_from || null,
        bridge_price: data.bridge_price || null,
        our_order: data.our_order || null,
        time: moment().format(),
        locked: 0,
        total: obj.total,
        bridge_orderid: data.bridge_orderid || null,
        del: 0,
      });

      const orderTransaction = await this.transactionsRepository.create({
        user_id: user.id,
        coin: obj.target_asset.toLowerCase(),
        amount: math.round(data.amount * -1, 8),
        type: 'order_created_sell',
        item_id: orderSaved.id,
        is_retention: 1,
      });

      await getManager().transaction(async transactionalEntityManager => {
        await transactionalEntityManager.save(orderSaved);
        await transactionalEntityManager.save(orderTransaction);
      });

      const newOrder = {
        orderIdentificator: orderSaved.identificator,
        user_id: user.uid,
        pair: orderSaved.pair,
        side: orderSaved.side,
        amount: orderSaved.amount,
        price: orderSaved.price_unity,
      };

      return {
        success: true,
        message: 'Ordem enviada com sucesso',
        newOrder,
      };
    } catch (error) {
      throw new RpcException('Ocorreu um erro na operação');
    }
  }

  async insertBridgeOrder(executedId: number, pair: string) {
    await this.bridgeOrdersRepository
      .create({
        done: 0,
        executed_id: executedId,
        pair,
        time: moment().format(),
        time_done: null,
        result: null,
      })
      .save();
  }

  async fixOrderTotal(order: Orders) {
    if (order.side === 'sell') {
      return;
    }

    const orderTotal = math.round(math.multiply(order.amount_source, order.price_unity), 2);

    const executedOrders = await this.executedOrdersRepository.find({
      where: {
        order_id: order.id,
      },
    });

    const totalOrderExecuted = executedOrders.reduce((prev, cur) => {
      return math.sum(prev, cur.total);
    }, 0);

    if (orderTotal !== math.round(totalOrderExecuted, 2)) {
      const diff = math.round(math.subtract(totalOrderExecuted, orderTotal), 2);

      await this.transactionsRepository.create({
        user_id: order.user_id,
        coin: order.pair.split('/')[1],
        amount: diff,
        type: 'order_diff',
        item_id: order.id,
        is_retention: 1,
      });
    }

    return;
  }
}
