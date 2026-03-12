import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket/handlers';
import { LOG_FILE } from './utils/logger';

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// 根路由
app.get('/', (req, res) => {
  res.json({
    name: 'Texas Poker Server',
    version: '1.0.0',
    status: 'running'
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 设置Socket处理器
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🎲 德州扑克服务器运行在端口 ${PORT}`);
  console.log(`📝 游戏日志文件: ${LOG_FILE}`);
});

export { app, httpServer, io };
