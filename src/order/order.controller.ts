import { MessagePattern } from '@nestjs/microservices';
import { Controller, Get } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderExecutionService } from './orderExecution.service';

@Controller('/orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderExecutionService: OrderExecutionService,
  ) {}

  @MessagePattern({ cmd: 'get_all_available_pairs' })
  async getAllAvailablePairs() {
    return await this.orderService.getAllAvailablePairs();
  }

  @MessagePattern({ cmd: 'get_all_available_coins' })
  async getAllAvailableCoins() {
    return await this.orderService.getAllAvailableCoins();
  }

  @MessagePattern({ cmd: 'get_all_orders' })
  async getAllOrders(data) {
    return await this.orderService.getAllOrders(data);
  }

  @MessagePattern({ cmd: 'validate_coin_available' })
  async validateCoinAvailable(data) {
    return await this.orderService.validateCoinAvailable(data);
  }

  @MessagePattern({ cmd: 'validate_pair_available' })
  async validatePairAvailable(data) {
    return await this.orderService.validatePairAvailable(data);
  }

  @MessagePattern({ cmd: 'get_extract' })
  async getExtract(data) {
    return await this.orderService.getExtract(data);
  }

  @MessagePattern({ cmd: 'send_deposit' })
  async sendDeposit(data) {
    return await this.orderService.sendDeposit(data);
  }

  @MessagePattern({ cmd: 'update_deposit' })
  async updateDeposit(data) {
    return await this.orderService.updateDeposit(data);
  }

  @MessagePattern({ cmd: 'order_execution' })
  async orderExecution(data) {
    return await this.orderExecutionService.run(data);
  }

  @MessagePattern({ cmd: 'place_order' })
  async placeOrder(data) {
    return await this.orderService.placeOrder(data);
  }

  @MessagePattern({ cmd: 'order_delete' })
  async orderDelete(data) {
    return await this.orderService.orderDelete(data);
  }

  @MessagePattern({ cmd: 'buy_sell_orders' })
  async ordersBuyAndSellPrices({ pair }) {
    return await this.orderService.ordersBuyAndSellPrices(pair);
  }

  @MessagePattern({ cmd: 'order_executed_get_info' })
  async ordersExecutedGetInfo({ pair }) {
    return await this.orderService.ordersExecutedGetInfo(pair);
  }

  @MessagePattern({ cmd: 'get_all_trades' })
  async getTrades({ pair }) {
    return await this.orderService.getTrades(pair);
  }

  @MessagePattern({ cmd: 'get_trades_api' })
  async getTradesApi({ pair }) {
    return await this.orderService.getTradesApi(pair);
  }

  @MessagePattern({ cmd: 'get_ticker' })
  async getTicker({ pair }) {
    return await this.orderService.getTicker(pair);
  }

  @MessagePattern({ cmd: 'get_ticker_api' })
  async getTickerApi({ pair }) {
    return await this.orderService.getTickerApi(pair);
  }

  @MessagePattern({ cmd: 'get_all_order_book' })
  async getAllOrderBook({ pair }) {
    return await this.orderService.getAllOrderBook(pair);
  }

  @MessagePattern({ cmd: 'get_all_order_book_api' })
  async getAllOrderBookApi({ pair }) {
    return await this.orderService.getAllOrderBookApi(pair);
  }

  @MessagePattern({ cmd: 'get_order_limit' })
  async getOrderLimit() {
    return await this.orderService.getOrderLimit();
  }
}
