import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, `game-${new Date().toISOString().slice(0, 10)}.log`);

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 写入日志的函数
export function writeLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(LOG_FILE, logLine);

  // 同时输出到控制台
  console.log(message);
}

// 专门写入游戏流程日志
export function writeGameLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [GameFlow] ${message}\n`;

  fs.appendFileSync(LOG_FILE, logLine);
  console.log(`[GameFlow] ${message}`);
}

export { LOG_FILE };
