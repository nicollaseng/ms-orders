import { Column, Entity, PrimaryGeneratedColumn, BaseEntity } from 'typeorm';

@Entity('bridge_orders')
export class BridgeOrders extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  done: number;

  @Column('int')
  executed_id: number;

  @Column('timestamptz')
  time: string;

  @Column('timestamptz')
  time_done: string;

  @Column('varchar')
  result: string;

  @Column('varchar')
  pair: string;
}
