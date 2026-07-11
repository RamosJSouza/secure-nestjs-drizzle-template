import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NodemailerAdapter } from './nodemailer.adapter';

jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn().mockResolvedValue({ user: 'ethereal-user', pass: 'ethereal-pass' }),
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
  getTestMessageUrl: jest.fn().mockReturnValue('https://ethereal.email/message/abc'),
}));

describe('NodemailerAdapter', () => {
  let adapter: NodemailerAdapter;
  const nodemailer = jest.requireMock('nodemailer');

  beforeEach(async () => {
    nodemailer.createTransport().sendMail.mockClear();
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string | number> = {
          env: 'development',
          'smtp.fromEmail': 'noreply@test.local',
          'smtp.fromName': 'Test',
        };
        return map[key];
      }),
    } as unknown as ConfigService;

    adapter = new NodemailerAdapter(config);
    await adapter.onModuleInit();
  });

  it('sends password-reset email via transporter', async () => {
    await adapter.sendMail('user@example.com', 'Reset', 'password-reset', {
      resetUrl: 'http://localhost/reset?token=abc',
      expiresMinutes: 15,
    });

    expect(nodemailer.createTransport().sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset',
        html: expect.stringContaining('Reset password'),
      }),
    );
  });
});
