import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from "typeorm";
import { RolePermission } from "./role-permission.entity";
import { User } from "./user.entity";

@Entity('roles')
@Index(['name', 'isActive'])
export class Role {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    @Index()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ default: true })
    @Index()
    isActive: boolean;

    @OneToMany(() => RolePermission, rp => rp.role)
    rolePermissions: RolePermission[];

    @OneToMany(() => User, user => user.role)
    users: User[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}