import { generateHashId } from './../../utils/hashId';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity,
  BeforeInsert,
} from 'typeorm';

@Entity('trades')
export class Trades extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { nullable: false })
  identificator: string;

  @Column('varchar', { nullable: false })
  execution_id: string;

  @Column('varchar', { nullable: false })
  side: string;

  @Column({ type: 'decimal', nullable: false })
  amount_executed: number;

  @Column({ type: 'decimal', nullable: false })
  price_unity: number;

  @Column('varchar', { nullable: false })
  time_executed: string;

  @Column('varchar', { nullable: false })
  pair: string;

  @Column('int', { nullable: false })
  order_id: number;

  @Column('int', { nullable: false })
  order_compatible_id: number;

  @Column('varchar', { nullable: false })
  user_id_active: string;

  @Column('varchar', { nullable: false })
  user_id_passive: string;

  @BeforeInsert()
  addId() {
    this.identificator = generateHashId();
  }
}
