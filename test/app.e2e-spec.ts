import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({ message: 'Hello World!' });
  });

  it('/health/liveness (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/liveness')
      .expect(200)
      .expect((res) => expect(res.body).toHaveProperty('status', 'ok'));
  });
});
