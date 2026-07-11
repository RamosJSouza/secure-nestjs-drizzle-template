import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { TokenRevocationService } from './token-revocation.service';

describe('TokenRevocationService', () => {
  let service: TokenRevocationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TokenRevocationService,
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('true') } },
      ],
    }).compile();
    service = module.get(TokenRevocationService);
  });

  describe('revokeSessionJtis', () => {
    it('flattens session credential fields and calls revokeMany', async () => {
      jest.spyOn(service, 'revokeMany').mockResolvedValue(undefined);
      await service.revokeSessionJtis(
        [
          { accessTokenJti: 'a1', refreshTokenJti: 'r1' },
          { accessTokenJti: null, refreshTokenJti: 'r2' },
        ],
        true,
      );
      expect(service.revokeMany).toHaveBeenCalledWith(['a1', 'r1', 'r2'], TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS, true);
    });

    it('skips revokeMany when all JTIs are null', async () => {
      jest.spyOn(service, 'revokeMany').mockResolvedValue(undefined);
      await service.revokeSessionJtis([{ accessTokenJti: null, refreshTokenJti: null }], false);
      expect(service.revokeMany).not.toHaveBeenCalled();
    });

    it('defaults failClosed to false', async () => {
      jest.spyOn(service, 'revokeMany').mockResolvedValue(undefined);
      await service.revokeSessionJtis([{ accessTokenJti: 'a1', refreshTokenJti: null }]);
      expect(service.revokeMany).toHaveBeenCalledWith(['a1'], TokenRevocationService.ACCESS_TOKEN_TTL_SECONDS, false);
    });
  });
});
