import { Test } from '@nestjs/testing';
import { RoleController } from './role.controller';
import { RoleService } from '../services/role.service';
import { JwtAuthGuard } from '@/auth/strategy/jwt-auth.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';

describe('RoleController', () => {
  it('passes actorUserId to assignPermissions', async () => {
    const roleService = { assignPermissions: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [{ provide: RoleService, useValue: roleService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = module.get(RoleController);
    const roleId = '11111111-1111-1111-1111-111111111111';
    const actorId = '22222222-2222-2222-2222-222222222222';

    await controller.assignPermissions(roleId, { permissionIds: ['p1'] }, actorId);

    expect(roleService.assignPermissions).toHaveBeenCalledWith(roleId, { permissionIds: ['p1'] }, actorId);
  });
});
