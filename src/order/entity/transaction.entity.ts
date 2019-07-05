import { Column, Entity, PrimaryColumn, BaseEntity } from 'typeorm';

@Entity('transactions')
export class Transactions extends BaseEntity {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ type: 'int', nullable: false })
  item_id: number;

  @Column({ type: 'varchar', nullable: false })
  coin: string;

  @Column({ type: 'decimal', nullable: false })
  amount: number;

  @Column({ type: 'smallint', nullable: false })
  is_retention: number;

  @Column({ type: 'varchar', nullable: false })
  type: string;

  @Column({ type: 'varchar', nullable: false })
  time: string;
}
