import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { User } from './user.entity';
import { generateHashId } from '../../utils/hashId';

@Entity('orders')
export class Orders extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  done: number;

  @Column()
  user_id: number;

  @Column()
  del: number;

  @Column()
  side: string;

  @Column()
  pair: string;

  @Column()
  currency_from: string;

  @Column()
  price_unity: number;

  @Column()
  amount: number;

  @Column()
  amount_source: number;

  @Column()
  total: number;

  @Column()
  price_done: number;

  @Column()
  time: string;

  @Column()
  time_del: string;

  @Column()
  time_done: string;

  @Column()
  locked: number;

  @Column()
  bridge_from: number;

  @Column()
  bridge_price: number;

  @Column()
  our_order: number;

  @Column()
  bridge_done: number;

  @Column()
  bridge_orderid: string;

  @Column()
  identificator: string;

  @ManyToOne(type => User, user => user.orders)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @BeforeInsert()
  addId() {
    this.identificator = generateHashId();
  }
}
