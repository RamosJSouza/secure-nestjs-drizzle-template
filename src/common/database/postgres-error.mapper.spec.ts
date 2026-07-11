import { ConflictException } from '@nestjs/common';
import { mapPostgresError } from './postgres-error.mapper';

describe('mapPostgresError', () => {
  it('maps 23505 (unique violation) to ConflictException', () => {
    expect(() => mapPostgresError({ code: '23505' }, 'duplicate')).toThrow(ConflictException);
    expect(() => mapPostgresError({ code: '23505' }, 'duplicate')).toThrow('duplicate');
  });

  it('maps 23503 (foreign key violation) to ConflictException', () => {
    expect(() => mapPostgresError({ code: '23503' }, 'referenced')).toThrow(ConflictException);
    expect(() => mapPostgresError({ code: '23503' }, 'referenced')).toThrow('referenced');
  });

  it('rethrows unknown error codes unchanged', () => {
    const err = new Error('other');
    expect(() => mapPostgresError(err, 'ctx')).toThrow(err);
  });

  it('rethrows errors without a code property', () => {
    const err = new Error('no code');
    expect(() => mapPostgresError(err, 'ctx')).toThrow(err);
  });
});
