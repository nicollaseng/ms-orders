import { IsAlphanumeric, IsNotEmpty, IsPositive } from 'class-validator';

export class WithdrawCryptoCoin {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  currency: string;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  wallet: string;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  amount: number;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  fee: number;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  auth2fa: string;
}

export class SendDepositDTO {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  @IsPositive()
  amount: number;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  @IsAlphanumeric()
  type: 'TED' | 'DOC' | 'SAME_BANK' | 'MONEY';

  userId: number;

  userIp: string;

  userAgent: string;
}

export class UpdateDepositDTO {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  identificator: string;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  @IsAlphanumeric()
  receipt: string;
}

export class OrdersDTO {
  userId: number;
}

export class ExtractDTO {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  currency: string;

  @IsNotEmpty({ message: 'Campo obrigatório' })
  @IsAlphanumeric()
  type: string;
}

export class OrderExecutionDTO {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  order_identificator: string;
}

export class UploadDepositDTO {
  @IsNotEmpty({ message: 'Campo obrigatório' })
  deposit_id: string;
}

export class OrderDeleteDTO {
  @IsNotEmpty()
  orderIdentificator: string;

  userId: number;
}

export class PlaceOrderDTO {
  // @IsNotEmpty()
  // token: string;

  @IsNotEmpty()
  pair: string;

  @IsNotEmpty()
  @IsPositive()
  amount: number;

  @IsNotEmpty()
  @IsPositive()
  price: number;

  userId: string;

  bridge_price: number; // usado apenas pelo bot

  bridge_from: number; // usado apenas pelo bot

  bridge_orderid: string; // usado apenas pelo bot

  our_order: number; // usado apenas pelo bot

  @IsNotEmpty()
  order_type: string;
}
