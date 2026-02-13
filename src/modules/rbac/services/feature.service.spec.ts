import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeatureService } from './feature.service';
import { Feature } from '../entities/feature.entity';

describe('FeatureService', () => {
    let service: FeatureService;
    let mockFeatureRepo: any;
    let mockDataSource: any;

    beforeEach(async () => {
        const mockQueryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };

        mockFeatureRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
        };

        mockDataSource = {
            createQueryRunner: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FeatureService,
                { provide: getRepositoryToken(Feature), useValue: mockFeatureRepo },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<FeatureService>(FeatureService);
    });

    it('should create feature ensuring unique key', async () => {
        const dto = { key: 'test', name: 'Test' };
        mockFeatureRepo.create.mockReturnValue(dto);
        mockFeatureRepo.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', ...dto });
    });

    it('should fail on duplicate key', async () => {
        const error = new Error('Unique constraint');
        (error as any).code = '23505';

        mockFeatureRepo.save.mockRejectedValue(error);
        await expect(service.create({ key: 'test', name: 'Test' })).rejects.toThrow();
    });

    it('should calculate pagination correctly', async () => {
        mockFeatureRepo.createQueryBuilder().getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll({ page: 2, limit: 10 });

        expect(mockFeatureRepo.createQueryBuilder().skip).toHaveBeenCalledWith(10);
        expect(mockFeatureRepo.createQueryBuilder().take).toHaveBeenCalledWith(10);
    });

    it('should throw error when deleting feature with dependencies', async () => {
        const error = new Error('FK violation');
        (error as any).code = '23503';

        mockFeatureRepo.delete.mockRejectedValue(error);
        await expect(service.remove('1')).rejects.toThrow();
    });
});
