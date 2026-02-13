import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermissionService } from './permission.service';
import { Permission } from '../entities/permission.entity';

describe('PermissionService', () => {
    let service: PermissionService;
    let mockPermissionRepo: any;
    let mockDataSource: any;

    beforeEach(async () => {
        mockPermissionRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            find: jest.fn(),
        };

        mockDataSource = {
            createQueryRunner: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionService,
                { provide: getRepositoryToken(Permission), useValue: mockPermissionRepo },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<PermissionService>(PermissionService);
    });

    it('should create new permission', async () => {
        const dto = { action: 'test:view', name: 'Test Permission', featureId: 'feature-1' };
        mockPermissionRepo.create.mockReturnValue(dto);
        mockPermissionRepo.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', ...dto });
    });

    it('should throw on duplicate permission', async () => {
        const error = new Error('Duplicate entry');
        (error as any).code = '23505';

        mockPermissionRepo.save.mockRejectedValue(error);
        await expect(service.create({ action: 'test:view', name: 'Duplicate', featureId: 'ft-1' })).rejects.toThrow();
    });

    it('should find permissions by feature', async () => {
        const permissions = [{ id: '1', action: 'view' }, { id: '2', action: 'edit' }];
        mockPermissionRepo.find.mockResolvedValue(permissions);

        const result = await service.findByFeature('feature-1');
        expect(result).toHaveLength(2);
        expect(mockPermissionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { featureId: 'feature-1' } }));
    });
});
