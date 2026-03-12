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
                  entry.message
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
