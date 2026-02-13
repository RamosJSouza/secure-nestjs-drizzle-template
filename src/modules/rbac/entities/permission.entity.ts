import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { Feature } from "./feature.entity";

@Entity('permissions')
@Unique(['featureId', 'action'])
@Index(['featureId', 'action'])
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Feature, feature => feature.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature: Feature;

  @Column({ name: 'feature_id' })
  featureId: string;

  @Column()
  @Index()
  action: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}