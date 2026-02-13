import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RoleService } from './role.service';
import { RbacService } from './rbac.service';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { User } from '../entities/user.entity';
describe('RoleService', () => {
    let service: RoleService;
    let mockRoleRepo: any;
    let mockRolePermissionRepo: any;
    let mockUserRepo: any;
    let mockRbacService: any;
    let mockDataSource: any;

    beforeEach(async () => {
        mockRoleRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
        };

        mockRolePermissionRepo = {
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            find: jest.fn(),
        };

        mockUserRepo = {
            count: jest.fn(),
        };

        mockRbacService = {
            invalidateRoleCache: jest.fn(),
        };

        mockDataSource = {
            createQueryRunner: jest.fn().mockReturnValue({
                connect: jest.fn(),
                startTransaction: jest.fn(),
                commitTransaction: jest.fn(),
                rollbackTransaction: jest.fn(),
                release: jest.fn(),
                manager: {
                    findOne: jest.fn(),
                    create: jest.fn(),
                    save: jest.fn(),
                    delete: jest.fn(),
                },
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoleService,
                { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
                { provide: getRepositoryToken(RolePermission), useValue: mockRolePermissionRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: RbacService, useValue: mockRbacService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<RoleService>(RoleService);
    });

    it('should create a role in a transaction', async () => {
        const dto = { name: 'Admin' };
        mockDataSource.createQueryRunner().manager.findOne.mockResolvedValue(null);
        mockDataSource.createQueryRunner().manager.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', name: 'Admin' });
        expect(mockDataSource.createQueryRunner().commitTransaction).toHaveBeenCalled();
    });

    it('should prevent creating duplicate roles', async () => {
        mockDataSource.createQueryRunner().manager.findOne.mockResolvedValue({ name: 'Admin' });

        await expect(service.create({ name: 'Admin' })).rejects.toThrow();
        expect(mockDataSource.createQueryRunner().rollbackTransaction).toHaveBeenCalled();
    });

    it('should assign permissions transactionally', async () => {
        mockRoleRepo.findOne.mockResolvedValue({ id: 'role-1' });

        await service.assignPermissions('role-1', { permissionIds: ['p1', 'p2'] });

        expect(mockDataSource.createQueryRunner().manager.delete).toHaveBeenCalledWith(RolePermission, { roleId: 'role-1' });
        expect(mockDataSource.createQueryRunner().manager.save).toHaveBeenCalled();
        expect(mockRbacService.invalidateRoleCache).toHaveBeenCalledWith('role-1');
    });

    it('should not delete role if users are assigned', async () => {
        mockRoleRepo.findOne.mockResolvedValue({ id: 'role-1' });
        mockUserRepo.count.mockResolvedValue(5);

        await expect(service.remove('role-1')).rejects.toThrow();
    });
});
