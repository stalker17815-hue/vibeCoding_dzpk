import React, { useEffect, useRef } from 'react';
import './GameLog.css';

export interface GameLogEntry {
  id: number;
  timestamp: number;
  message: string;
  type: 'action' | 'system' | 'game' | 'ai-thinking';
  playerSeat?: number;
}

interface GameLogProps {
  entries: GameLogEntry[];
  playerNames: Record<number, string>;
}

export const GameLog: React.FC<GameLogProps> = ({ entries, playerNames }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  const getPlayerName = (seatIndex?: number) => {
    if (seatIndex === undefined) return '系统';
    return playerNames[seatIndex] || `玩家${seatIndex}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  };

  // 解析消息，高亮金额和行动
  const renderMessage = (message: string, type: string) => {
    if (type === 'action') {
      // 定义行动关键词和对应的高亮类名
      const actions: Record<string, string> = {
        '过牌': 'action-check',
        '弃牌': 'action-fold',
        '跟注': 'action-call',
        '加注': 'action-raise',
        '全下': 'action-allin',
      };

      // 替换行动关键词
      let result = message;
      for (const [action, className] of Object.entries(actions)) {
        result = result.replace(new RegExp(action, 'g'), `<span class="${className}">${action}</span>`);
      }

      // 匹配金额数字
      const parts = result.split(/(\d+)/);
      return (
        <span dangerouslySetInnerHTML={{ __html: parts.map((part) =>
          /^\d+$/.test(part) ? `<span class="bet-amount">${part}</span>` : part
        ).join('') }} />
      );
    }
    return message;
  };

  return (
    <div className="game-log-container">
      <div className="game-log-header">
        <span className="game-log-title">📋 游戏记录</span>
      </div>
      <div className="game-log-entries" ref={containerRef}>
        {entries.length === 0 ? (
          <div className="game-log-empty">游戏即将开始...</div>
        ) : (
          // 按时间戳排序确保显示顺序正确
          [...entries].sort((a, b) => a.timestamp - b.timestamp).map((entry) => (
            <div key={entry.id} className={`game-log-entry ${entry.type}`}>
              <span className="log-time">{formatTime(entry.timestamp)}</span>
              <span className="log-message">
                {entry.type === 'ai-thinking' ? (
                  <>🤔 {getPlayerName(entry.playerSeat)} 正在思考...</>
                ) : (
                  renderMessage(entry.message, entry.type)
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
