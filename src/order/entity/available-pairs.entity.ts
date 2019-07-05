import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('available_pairs')
export class AvailablePairs {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'smallint', nullable: false })
  btc_brl: number;

  @Column({ type: 'smallint', nullable: false })
  eth_brl: number;

  @Column({ type: 'smallint', nullable: false })
  ltc_brl: number;
}
