import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity,
  BeforeInsert,
} from 'typeorm';
import { generateHashId } from '../../utils/hashId';

@Entity('deposits')
export class Deposits extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false, default: 0 })
  done: number;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column('varchar', { nullable: false, default: 'BRL' })
  currency: string;

  @Column({ type: 'decimal', nullable: false })
  amount: number;

  @Column({ type: 'decimal', nullable: false })
  fee: number;

  @Column({ type: 'decimal', nullable: false })
  liquid_amount: number;

  @Column({ type: 'varchar', length: 10, nullable: false })
  type: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  receipt: string;

  @Column('varchar', { default: () => 'CURRENT_TIMESTAMP' })
  time: string;

  @Column({ type: 'varchar', nullable: true })
  identificator: string;

  @BeforeInsert()
  addId() {
    this.identificator = generateHashId();
  }
}
