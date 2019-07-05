import { ExecutedOrders } from "./entity/executed-orders.entity";
import { RpcException, ClientProxy } from "@nestjs/microservices";
import { OrderExecutionDTO } from "./dto/orders.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Injectable, Inject, Logger } from "@nestjs/common";
import { Orders } from "./entity/orders.entity";
import {
  Repository,
  MoreThan,
  MoreThanOrEqual,
  LessThanOrEqual,
  getManager
} from "typeorm";
import * as moment from "moment";
import { generateHashId } from "../utils/hashId";
import * as math from "mathjs";
import { CustomFee } from "./entity/custom_fees.entity";
import { DefaultFee } from "./entity/default_fees.entity";
import { Trades } from "./entity/trades.entity";
import { OrderService } from "./order.service";
import { User } from "./entity/user.entity";
import * as currencyFormatter from "currency-formatter";
import { Transactions } from "./entity/transaction.entity";

@Injectable()
export  class OrderExecutionService {
  constructor(
    @InjectRepository(Orders)
    private readonly orderRepository: Repository<Orders>,
    @InjectRepository(ExecutedOrders)
    private readonly executedOrdersRepository: Repository<ExecutedOrders>,
    @InjectRepository(CustomFee)
    private readonly customFeeRepository: Repository<CustomFee>,
    @InjectRepository(DefaultFee)
    private readonly defaultFeeRepository: Repository<DefaultFee>,
    @InjectRepository(Trades)
    private readonly tradesRepository: Repository<Trades>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @Inject("NATS_CONNECTION")
    private readonly clientProxy: ClientProxy,
    private readonly orderService: OrderService
  ) {}

  async run(data: OrderExecutionDTO) {
    let userCompatible: User = null;
    let userIdentified: User = null;
    let ordersExecuted: Array<{
      done: number;
      orderIdentificator: string;
      amount: number;
    }> = [];

    const orders = await this.searchOrders(data.order_identificator, data);

    const { orderCompatible, orderIdentified } = orders;

    if (orderCompatible.length === 0) {
      throw new RpcException("Nenhuma ordem compativel");
    }

    userCompatible = orderCompatible[0].user;
    userIdentified = orderIdentified.user;

    try {
      for (const order of orderCompatible) {
        if (orderIdentified.done === 1) {
          break;
        }

        const {
          orderCompatibleExecuted,
          orderIdentifiedExecuted
        } = await this.executeOrder(orderIdentified, order);

        // prepara os dados que serão enviados para o front
        ordersExecuted = [
          ...ordersExecuted,
          {
            done: orderCompatibleExecuted.done,
            orderIdentificator: orderCompatibleExecuted.identificator,
            amount: orderCompatibleExecuted.amount
          },
          {
            done: orderIdentifiedExecuted.done,
            orderIdentificator: orderIdentifiedExecuted.identificator,
            amount: orderIdentifiedExecuted.amount
          }
        ];
      }

      console.log("execution finished", ordersExecuted);
      return {
        success: true,
        userIdCompatible: userCompatible.uid,
        userIdIdentified: userIdentified.uid,
        ordersExecuted
      };
    } catch (err) {
      await this.clientProxy
        .send(
          { cmd: "block_user_account" },
          {
            userId: userCompatible.id
          }
        )
        .toPromise()
        .catch(async err => {});

      await this.clientProxy
        .send(
          { cmd: "block_user_account" },
          {
            userId: userIdentified.id
          }
        )
        .toPromise()
        .catch(async err => {});

      Logger.error(
        `Erro na execucao de ordem ${err.message}`,
        err,
        "OrderExecutionService.run"
      );

      throw new RpcException(err);
    }
  }

  async getOrderByIndentificador(identificator) {
    return await this.orderRepository.findOne({
      where: {
        identificator,
        done: 0,
        del: 0,
        locked: 0,
        price_unity: MoreThan(0),
        amount: MoreThan(0)
      }
    });
  }

  async getOrders(){
    return await this.orderRepository.find({})
  }

  private async searchOrders(orderId: string, data: any) {
    Logger.log(
      `FIND ORDER, orderId: ${orderId}`,
      "OrderExecutionService.searchOrders",
      true
    );

    const order = await this.orderRepository.find({
      where: {
        identificator: orderId,
        done: 0,
        del: 0,
        locked: 0,
        price_unity: MoreThan(0),
        amount: MoreThan(0)
      },
      relations: ["user"]
    });

    const [orderIdentified] = order;

    if (!orderIdentified) {
      return {
        orderIdentified: null,
        orderCompatible: null
      };
    }

    const pair = orderIdentified.pair.replace("/", "_").toLowerCase();

    try {
      await this.orderService.validatePairAvailable({ pair });
    } catch (err) {
      return {
        orderIdentified: null,
        orderCompatible: null
      };
    }

    const currencies = orderIdentified.pair.split("/");

    const target_asset = currencies[0];
    const base_asset = currencies[1];

    try {
      await this.orderService.validateCoinAvailable({ coin: target_asset });
      await this.orderService.validateCoinAvailable({ coin: base_asset });
    } catch (err) {
      return {
        orderIdentified: null,
        orderCompatible: null
      };
    }

    let price;
    let side;
    let orderBy;

    if (orderIdentified.side === "buy") {
      side = "sell";
      price = orderIdentified.price_unity;
      orderBy = "ASC";
    } else if (orderIdentified.side === "sell") {
      side = "buy";
      price = orderIdentified.price_unity;
      orderBy = "DESC";
    }

    let lessEqualPrice = {
      locked: 0,
      done: 0,
      side,
      pair: orderIdentified.pair,
      del: 0,
      amount: MoreThan(0),
      price_unity: LessThanOrEqual(price)
    };

    let moreThanPrice = {
      locked: 0,
      done: 0,
      side,
      pair: orderIdentified.pair,
      del: 0,
      amount: MoreThan(0),
      price_unity: MoreThan(price)
    };
      
    Logger.log("FIND COMPATIBLE", "OrderExecutionService.searchOrders", true);

    const orderCompatible = await this.orderRepository.find({
      where: [lessEqualPrice, moreThanPrice],
      order: {
        price_unity: orderBy
      },
      relations: ["user"]
    });

    const currenciesCompatible = orderIdentified.pair.split("/");

    const target_assetCompatible = currenciesCompatible[0];
    const base_assetCompatible = currenciesCompatible[1];

    try {
      await this.orderService.validateCoinAvailable({
        coin: target_assetCompatible
      });
      await this.orderService.validateCoinAvailable({
        coin: base_assetCompatible
      });
    } catch (err) {
      throw new RpcException(err.message);
    }

    return {
      orderIdentified,
      orderCompatible
    };
  }

  private async executeOrder(orderIdentified: Orders, orderCompatible: Orders) {
    Logger.log("EXECUTION", "OrderExecutionService.executeOrder", true);
    Logger.log(
      `ORDER IDENTIFIED: ${orderIdentified}`,
      "OrderExecutionService.executeOrder",
      true
    );
    Logger.log(
      `ORDER COMPATIBLE: ${orderCompatible}`,
      "OrderExecutionService.executeOrder",
      true
    );


    orderCompatible.locked = 1;
    orderIdentified.locked = 1;

    await orderCompatible.save();
    await orderIdentified.save();

    let amountDone: number; //quantidade de ordem

    if (
      math.number(orderIdentified.amount) > math.number(orderCompatible.amount)
    ) {
      amountDone = orderCompatible.amount;
    } else {
      amountDone = orderIdentified.amount;
    }

    const orders =  await this.orderRepository.find({
      where: {
        done: 0,
        del: 0,
        locked: 0,
        price_unity: MoreThan(0),
        amount: MoreThan(0)
      },
      relations: ["user"]
    });

    let ordersPriceAverage = 0

    if(orders && orders.length > 0){
      let averageOrder = []
      orders.map(order => {
        averageOrder = [...averageOrder, order.price_unity]
      })
      if(averageOrder && averageOrder.length > 0){
        ordersPriceAverage = averageOrder.reduce((a,b) => a+b,0)
      } else {
        ordersPriceAverage = 1
      }
    }

    const priceDone = //preco de venda unitario
      orderIdentified.side === "sell"
        ? math.round(orderIdentified.price_unity/ordersPriceAverage, 2)
        : math.round(orderCompatible.price_unity/ordersPriceAverage, 2);

    const totalDone = math.round(math.multiply(amountDone, priceDone), 2);
    //preco total = quantidade*precounitario

    const unityBuyPrice =
      orderIdentified.side === "buy"
        ? math.round(orderIdentified.price_unity/ordersPriceAverage, 2)
        : math.round(orderCompatible.price_unity/ordersPriceAverage, 2);

    const totalDoneSource = math.round(
      math.multiply(amountDone, unityBuyPrice),
      2
    );
    // preco total de venda

    const getFee = async (order: Orders, maker: boolean) => {
      const customFee = await this.customFeeRepository.findOne({
        where: {
          user_id: order.user_id
        }
      });//busca taxas para id de usaurio

      const orderPair = order.pair.replace("/", "").toLowerCase();//???

      if (
        !customFee ||
        customFee[`${orderPair}_${maker ? "maker" : "taker"}`] === null
      ) {
        const defaultFee = await this.defaultFeeRepository.findOne({
          order: {
            id: "DESC"
          }
        });
        return defaultFee[`${orderPair}_${maker ? "maker" : "taker"}`];
      } else {
        return customFee[`${orderPair}_${maker ? "maker" : "taker"}`];
      }
    };

    const firstOrderId =
      orderIdentified.id < orderCompatible.id
        ? orderIdentified.id
        : orderCompatible.id;

    let orderFee;
    let orderCompatibleFee;

    if (firstOrderId === orderIdentified.id) {
      orderFee = await getFee(orderIdentified, true);
      orderCompatibleFee = await getFee(orderCompatible, false);
    } else {
      orderFee = await getFee(orderIdentified, false);
      orderCompatibleFee = await getFee(orderCompatible, true);
    }

    Logger.log("porcentagem taxa 1 = ", "OrderExecution.Transaction", true);
    Logger.log(orderFee, "OrderExecution.Transaction", true);
    Logger.log("porcentagem taxa 2 = ", "OrderExecution.Transaction", true);
    Logger.log(orderCompatibleFee, "OrderExecution.Transaction", true);

    const isOrderDone = orderIdentified.amount_source === amountDone ? 1 : 0;
    const isOrderCompatibleOrder =
      orderCompatible.amount_source === amountDone ? 1 : 0;

    const orderDataFee =
      orderIdentified.side === "buy"
        ? math.round(math.multiply(math.divide(amountDone, 100), orderFee), 8)
        : math.round(math.multiply(math.divide(totalDone, 100), orderFee), 2);

    const orderCompatibleDataFee =
      orderCompatible.side === "buy"
        ? math.round(
            math.multiply(math.divide(amountDone, 100), orderCompatibleFee),
            8
          )
        : math.round(
            math.multiply(math.divide(totalDone, 100), orderCompatibleFee),
            2
          );

    Logger.log("Taxa efetiva 1:", "OrderExecution.Transaction", true);
    Logger.log(orderDataFee, "OrderExecution.Transaction", true);
    Logger.log("Taxa efetiva 2:", "OrderExecution.Transaction", true);
    Logger.log(orderCompatibleDataFee, "OrderExecution.Transaction", true);

    let executedOrder;
    let executedOrderCompatible;

    try {
      const executionId = generateHashId();
      const timeExecuted = moment().format();

      executedOrder = await this.executedOrdersRepository
        .create({
          execution_id: executionId,
          int_done: isOrderDone,
          order_id: orderIdentified.id,
          side: orderIdentified.side,
          pair: orderIdentified.pair,
          user_id: orderIdentified.user_id,
          price_unity: priceDone,
          order_amount: orderIdentified.amount_source,
          amount_executed: amountDone,
          fee: orderDataFee,
          amount_left: math.round(
            math.subtract(orderIdentified.amount, amountDone),
            8
          ),
          total: totalDone,
          time_executed: timeExecuted
        })
        .save();

      executedOrderCompatible = await this.executedOrdersRepository
        .create({
          execution_id: executionId,
          int_done: isOrderCompatibleOrder,
          order_id: orderCompatible.id,
          done_with: executedOrder.id,
          side: orderCompatible.side,
          pair: orderCompatible.pair,
          user_id: orderCompatible.user_id,
          price_unity: priceDone,
          order_amount: orderCompatible.amount_source,
          amount_executed: amountDone,
          amount_left: math.round(
            math.subtract(orderCompatible.amount, amountDone),
            8
          ),
          fee: orderCompatibleDataFee,
          total: totalDone,
          time_executed: timeExecuted
        })
        .save();

      executedOrder.done_with = executedOrderCompatible.id;

      await executedOrder.save();

      await this.tradesRepository
        .create({
          user_id_active: orderIdentified.user.uid,
          user_id_passive: orderCompatible.user.uid,
          order_id: orderIdentified.id,
          order_compatible_id: orderCompatible.id,
          side: orderIdentified.side,
          pair: orderIdentified.pair,
          amount_executed: amountDone,
          price_unity: orderIdentified.price_unity,
          execution_id: executionId,
          time_executed: timeExecuted
        })
        .save();
    } catch (error) {
      throw new Error(error.message);
    }

    try {
      const transactionIdentifiedValue = await this.transactionsRepository.create(
        {
          user_id: orderIdentified.user_id,
          coin:
            orderIdentified.side === "buy"
              ? orderIdentified.pair.split("/")[1].toLowerCase()
              : orderIdentified.pair.split("/")[0].toLowerCase(),
          amount:
            orderIdentified.side === "buy"
              ? totalDone * -1
              : math.round(amountDone * -1, 8),
          is_retention: 0,
          type: `order_execution_${orderIdentified.side}`,
          item_id: orderIdentified.id,
          time: moment().format()
        }
      );

      const transactionIdentifiedAmount = await this.transactionsRepository.create(
        {
          user_id: orderIdentified.user_id,
          coin:
            orderIdentified.side === "buy"
              ? orderIdentified.pair.split("/")[0].toLowerCase()
              : orderIdentified.pair.split("/")[1].toLowerCase(),
          amount:
            orderIdentified.side === "buy"
              ? math.round(amountDone, 8)
              : totalDone,
          is_retention: 0,
          type: `order_execution_${orderIdentified.side}`,
          item_id: orderIdentified.id,
          time: moment().format()
        }
      );

      const transactionIdentifiedFee = await this.transactionsRepository.create(
        {
          user_id: orderIdentified.user_id,
          coin:
            orderIdentified.side === "buy"
              ? orderIdentified.pair.split("/")[0].toLowerCase()
              : orderIdentified.pair.split("/")[1].toLowerCase(),
          amount: orderDataFee * -1,
          is_retention: 0,
          type: `order_execution_${orderIdentified.side}_fee`,
          item_id: orderIdentified.id,
          time: moment().format()
        }
      );

      const transactionIdentifiedRetention = await this.transactionsRepository.create(
        {
          user_id: orderIdentified.user_id,
          coin:
            orderIdentified.side === "buy"
              ? orderIdentified.pair.split("/")[1].toLowerCase()
              : orderIdentified.pair.split("/")[0].toLowerCase(),
          amount:
            orderIdentified.side === "buy"
              ? totalDone
              : math.round(amountDone, 8),
          is_retention: 1,
          type: `order_execution_${orderIdentified.side}`,
          item_id: orderIdentified.id,
          time: moment().format()
        }
      );

      //////////////////////////
      /// ORDER COMPATIBLE  ///
      ////////////////////////
      const transactionCompatibleValue = await this.transactionsRepository.create(
        {
          user_id: orderCompatible.user_id,
          coin:
            orderCompatible.side === "buy"
              ? orderCompatible.pair.split("/")[1].toLowerCase()
              : orderCompatible.pair.split("/")[0].toLowerCase(),
          amount:
            orderCompatible.side === "buy"
              ? totalDone * -1
              : math.round(amountDone * -1, 8),
          is_retention: 0,
          type: `order_execution_${orderCompatible.side}`,
          item_id: orderCompatible.id,
          time: moment().format()
        }
      );

      const transactionCompatibleAmount = await this.transactionsRepository.create(
        {
          user_id: orderCompatible.user_id,
          coin:
            orderCompatible.side === "buy"
              ? orderCompatible.pair.split("/")[0].toLowerCase()
              : orderCompatible.pair.split("/")[1].toLowerCase(),
          amount:
            orderCompatible.side === "buy"
              ? math.round(amountDone, 8)
              : totalDone,
          is_retention: 0,
          type: `order_execution_${orderCompatible.side}`,
          item_id: orderCompatible.id,
          time: moment().format()
        }
      );

      const transactionCompatibleFee = await this.transactionsRepository.create(
        {
          user_id: orderCompatible.user_id,
          coin:
            orderCompatible.side === "buy"
              ? orderCompatible.pair.split("/")[0].toLowerCase()
              : orderCompatible.pair.split("/")[1].toLowerCase(),
          amount: orderCompatibleDataFee * -1,
          is_retention: 0,
          type: `order_execution_${orderCompatible.side}_fee`,
          item_id: orderCompatible.id,
          time: moment().format()
        }
      );

      const transactionCompatibleRetention = await this.transactionsRepository.create(
        {
          user_id: orderCompatible.user_id,
          coin:
            orderCompatible.side === "buy"
              ? orderCompatible.pair.split("/")[1].toLowerCase()
              : orderCompatible.pair.split("/")[0].toLowerCase(),
          amount:
            orderCompatible.side === "buy"
              ? totalDone
              : math.round(amountDone, 8),
          is_retention: 1,
          type: `order_execution_${orderCompatible.side}`,
          item_id: orderCompatible.id,
          time: moment().format()
        }
      );

      await getManager().transaction(async transactionalEntityManager => {
        await transactionalEntityManager.save(transactionIdentifiedValue);
        await transactionalEntityManager.save(transactionIdentifiedAmount);
        await transactionalEntityManager.save(transactionIdentifiedFee);
        await transactionalEntityManager.save(transactionIdentifiedRetention);

        await transactionalEntityManager.save(transactionCompatibleValue);
        await transactionalEntityManager.save(transactionCompatibleAmount);
        await transactionalEntityManager.save(transactionCompatibleFee);
        await transactionalEntityManager.save(transactionCompatibleRetention);
      });
    } catch (err) {
      Logger.log(err.message, "OrderExecution.Transaction", true);
      throw new Error(err.message);
    }

    if (orderIdentified.amount === amountDone) {
      orderIdentified.done = 1;
      orderIdentified.price_done = priceDone;
      orderIdentified.time_done = moment().format();
      this.orderService.fixOrderTotal(orderIdentified);
    } else {
      orderIdentified.price_done = priceDone;
      orderIdentified.time_done = moment().format();
    }

    orderIdentified.amount = math.round(
      math.subtract(orderIdentified.amount, amountDone),
      8
    );
    await orderIdentified.save();

    if (orderCompatible.amount === amountDone) {
      orderCompatible.done = 1;
      orderCompatible.price_done = priceDone;
      orderCompatible.time_done = moment().format();
      this.orderService.fixOrderTotal(orderCompatible);
    } else {
      orderCompatible.price_done = priceDone;
      orderCompatible.time_done = moment().format();
    }

    orderCompatible.amount = math.round(
      math.subtract(orderCompatible.amount, amountDone),
      8
    );
    await orderCompatible.save();

    const executedCurrency = executedOrder.pair.split("/")[0];

    const coinIdentified = await this.clientProxy
      .send(
        { cmd: "validate_coin_available" },
        {
          coin: executedCurrency
        }
      )
      .toPromise()
      .catch(err => {});

    const emailQueueData = {
      type: "order_executed",
      user_id: orderIdentified.user_id,
      information: JSON.stringify({
        type: executedOrder.side === "sell" ? "venda" : "compra",
        type_uppercase: executedOrder.side === "sell" ? "VENDA" : "COMPRA",
        amount: currencyFormatter.format(executedOrder.amount_executed, {
          format: "%v",
          decimal: ",",
          thousand: ".",
          precision: 8
        }),
        pair: executedOrder.pair.toUpperCase(),
        symbol: coinIdentified ? coinIdentified.data.currency_symbol : "",
        price: currencyFormatter.format(executedOrder.price_unity, {
          format: "%v",
          decimal: ",",
          thousand: ".",
          precision: 2
        }),
        order_id: executedOrder.identificator,
        total: currencyFormatter.format(executedOrder.total, {
          format: "%v",
          decimal: ",",
          thousand: ".",
          precision: 2
        }),
        date_time: moment(executedOrder.time_executed).format(
          "DD/MM/YYYY HH:mm"
        )
      })
    };

    this.clientProxy.send({ cmd: "save_email_queue" }, emailQueueData);

    const emailQeueCompatibleData = {
      type: "order_executed",
      information: JSON.stringify({
        type: executedOrderCompatible.side === "sell" ? "venda" : "compra",
        type_uppercase:
          executedOrderCompatible.side === "sell" ? "VENDA" : "COMPRA",
        pair: executedOrderCompatible.pair.toUpperCase(),
        amount: currencyFormatter.format(
          executedOrderCompatible.amount_executed,
          {
            format: "%v",
            decimal: ",",
            thousand: ".",
            precision: 8
          }
        ),
        symbol: coinIdentified ? coinIdentified.data.currency_symbol : "",
        price: currencyFormatter.format(executedOrderCompatible.price_unity, {
          format: "%v",
          decimal: ",",
          thousand: ".",
          precision: 2
        }),
        order_id: executedOrderCompatible.identificator,
        total: currencyFormatter.format(executedOrderCompatible.total, {
          format: "%v",
          decimal: ",",
          thousand: ".",
          precision: 2
        }),
        date_time: moment(executedOrderCompatible.time_executed).format(
          "DD/MM/YYYY HH:mm"
        )
      }),
      user_id: executedOrderCompatible.user_id
    };

    this.clientProxy.send({ cmd: "save_email_queue" }, emailQeueCompatibleData);

    orderCompatible.locked = 0;
    await orderCompatible.save();
    orderIdentified.locked = 0;
    await orderIdentified.save();

    let internalOrder: ExecutedOrders = null;

    if (orderCompatible.user.internal_account === 1) {
      internalOrder = executedOrderCompatible;
    }

    if (orderIdentified.user.internal_account === 1) {
      internalOrder = executedOrder;
    }

    if (internalOrder) {
      this.orderService.insertBridgeOrder(internalOrder.id, internalOrder.pair);
    }

    return {
      success: true,
      orderCompatibleExecuted: orderCompatible,
      orderIdentifiedExecuted: orderIdentified
    };
  }
}
