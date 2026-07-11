import { DatabaseHealthIndicator } from './database.health';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;

  function makeHealthIndicatorService() {
    const up = jest.fn().mockReturnValue({ db: { status: 'up' } });
    const down = jest.fn().mockReturnValue({ db: { status: 'down' } });
    return { check: jest.fn().mockReturnValue({ up, down }), _up: up, _down: down };
  }

  it('returns up when database ping succeeds', async () => {
    const his = makeHealthIndicatorService();
    const db = { ping: jest.fn().mockResolvedValue(undefined) };
    indicator = new DatabaseHealthIndicator(his as any, db as any);
    await expect(indicator.isHealthy('database')).resolves.toEqual({ db: { status: 'up' } });
    expect(db.ping).toHaveBeenCalled();
    expect(his._up).toHaveBeenCalled();
  });

  it('throws HealthCheckError when database ping fails', async () => {
    const his = makeHealthIndicatorService();
    const db = { ping: jest.fn().mockRejectedValue(new Error('connection refused')) };
    indicator = new DatabaseHealthIndicator(his as any, db as any);
    await expect(indicator.isHealthy('database')).rejects.toThrow();
    expect(his._down).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection refused' }));
  });
});
