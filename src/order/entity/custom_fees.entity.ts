import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('custom_fees')
export class CustomFee extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  btcbrl_maker: number;

  @Column()
  btcbrl_taker: number;

  @Column()
  ltcbrl_maker: number;

  @Column()
  ltcbrl_taker: number;

  @Column()
  ethbrl_maker: number;

  @Column()
  ethbrl_taker: number;

  @Column()
  brl_withdraw: number;

  @Column()
  ted: number;

  @Column()
  time_updated: string;
}
