import React, { useState } from 'react';
import './ProfitHistory.css';

interface PlayerProfit {
  name: string;
  profit: number;
  handType?: string;
}

interface RoundProfit {
  round: number;
  players: PlayerProfit[];
}

interface ProfitHistoryProps {
  history: RoundProfit[];
}

export const ProfitHistory: React.FC<ProfitHistoryProps> = ({ history }) => {
  const [selectedRound, setSelectedRound] = useState<RoundProfit | null>(null);

  // 计算总盈亏
  const totalProfit = history.reduce((sum, round) => {
    return sum + round.players.reduce((pSum, p) => pSum + p.profit, 0);
  }, 0);

  return (
    <>
      <div className="profit-history-container">
        <div className="profit-history-header">
          <span className="profit-history-title">💰 盈亏记录</span>
          <span className={`total-profit ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
            总计: {totalProfit >= 0 ? '+' : ''}{totalProfit}
          </span>
        </div>
        <div className="profit-history-entries">
          {history.length === 0 ? (
            <div className="profit-history-empty">暂无记录</div>
          ) : (
            history.map((record) => (
              <div
                key={record.round}
                className="round-entry"
                onClick={() => setSelectedRound(record)}
              >
                <span className="round-num">第{record.round}轮</span>
                <span className="round-arrow">›</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 详情弹框 */}
      {selectedRound && (
        <div className="profit-modal-overlay" onClick={() => setSelectedRound(null)}>
          <div className="profit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="profit-modal-header">
              <h3>第{selectedRound.round}轮 盈亏详情</h3>
              <button className="close-btn" onClick={() => setSelectedRound(null)}>×</button>
            </div>
            <div className="profit-modal-content">
              {selectedRound.players.map((player, index) => (
                <div key={index} className={`player-profit-row ${player.profit >= 0 ? 'win' : 'loss'}`}>
                  <span className="player-name">{player.name}</span>
                  <span className="player-profit">
                    {player.profit >= 0 ? '+' : ''}{player.profit}
                  </span>
                  {player.handType && (
                    <span className="player-hand-type">{player.handType}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
