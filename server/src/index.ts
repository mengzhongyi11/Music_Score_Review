import express from 'express';
import cors from 'cors';
import scoresRouter from './routes/scores';
import sectionsRouter from './routes/sections';
import commentsRouter from './routes/comments';
import usersRouter from './routes/users';
import versionsRouter from './routes/versions';
import fullscoreRouter from './routes/fullscore';
import branchesRouter from './routes/branches';
import feedRouter from './routes/feed';
import statsRouter from './routes/stats';
import tagsRouter from './routes/tags';
import dashboardRouter from './routes/dashboard';
import collaboratorsRouter from './routes/collaborators';
import authRouter from './routes/auth';
import importRouter from './routes/import';
import invitationsRouter from './routes/invitations';
import reviewsRouter from './routes/reviews';
import notificationsRouter from './routes/notifications';
import aiReviewRouter from './routes/aiReview';
import mergeRouter from './routes/merge';
import impactRouter from './routes/impact';
import preferencesRouter from './routes/preferences';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 路由
app.use('/api/scores', scoresRouter);
app.use('/api/sections', sectionsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/versions', versionsRouter);
app.use('/api', fullscoreRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/feed', feedRouter);
app.use('/api/stats', statsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/collaborators', collaboratorsRouter);
app.use('/api/auth', authRouter);
app.use('/api/import', importRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ai-review', aiReviewRouter);
app.use('/api/merge', mergeRouter);
app.use('/api/impact', impactRouter);
app.use('/api/preferences', preferencesRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: '乐谱审阅系统 API 运行中' });
});

// 导出 app 供测试使用
export { app };

// 非测试环境下启动服务器
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`✅ 服务器启动成功：http://localhost:${PORT}`);
    console.log(`📋 API 文档：http://localhost:${PORT}/api/health`);
  });
}
