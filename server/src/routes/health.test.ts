import request from 'supertest';
import { app } from '../index';

describe('GET /api/health', () => {
  it('返回 200 和健康状态', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('运行中');
  });
});
