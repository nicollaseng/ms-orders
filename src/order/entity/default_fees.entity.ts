import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('default_fees')
export class DefaultFee extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

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
