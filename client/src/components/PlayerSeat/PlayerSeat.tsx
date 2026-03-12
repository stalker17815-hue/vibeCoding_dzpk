import React from 'react';
import type { Player, Card as CardType } from '../../store/gameStore';
import { Card } from '../Card';
import './PlayerSeat.css';

interface PlayerSeatProps {
  player: Player;
  isCurrentPlayer: boolean;
  isMe: boolean;
  showCards: boolean;
  position: 'top' | 'left' | 'right' | 'bottom-left' | 'bottom-right';
  gameStarted?: boolean;
  dealingHoleCards?: boolean;
  seatIndex?: number;
  myHoleCards?: [CardType, CardType] | null;
}

const aiLevelNames: Record<number, string> = {
  1: '陪练',
  2: '概率',
  3: '策略',
};

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  isCurrentPlayer,
  isMe,
  showCards,
  position,
  gameStarted = false,
  dealingHoleCards = false,
  seatIndex = 0,
  myHoleCards = null,
}) => {
  // 根据座位计算发牌动画延迟
  const getHoleCardDelay = (cardIndex: number) => {
    if (!dealingHoleCards) return 0;
    // 每张牌延迟 0.15s，每个座位再延迟 0.2s
    return (seatIndex * 2 + cardIndex) * 0.15;
  };
  const getStatusText = () => {
    switch (player.status) {
      case 'folded':
        return '已弃牌';
      case 'all_in':
        return '全下';
      case 'disconnected':
        return '离线';
      default:
        return '';
    }
  };

  return (
    <div className={`player-seat player-seat-${position} ${isCurrentPlayer ? 'active' : ''} ${isMe ? 'me' : ''} ${player.status === 'folded' ? 'folded' : ''}`}>
      {/* 状态标签 */}
      {player.status !== 'active' && (
        <div className={`player-status status-${player.status}`}>
          {getStatusText()}
        </div>
      )}

      {/* 玩家信息 */}
      <div className="player-info">
        <div className="player-name">
          {player.name}
          {player.type === 'ai' && (
            <span className="ai-badge">AI-{aiLevelNames[player.aiLevel || 1]}</span>
          )}
        </div>
        <div className="player-chips">💰 {player.chips}</div>
      </div>

      {/* 手牌 */}
      <div className="player-cards">
        {/* 当是自己时使用 myHoleCards，否则使用 player.holeCards */}
        {(isMe && myHoleCards) ? (
          <>
            <Card
              card={myHoleCards[0]}
              hidden={!showCards}
              small
              animate={dealingHoleCards}
              delay={getHoleCardDelay(0)}
            />
            <Card
              card={myHoleCards[1]}
              hidden={!showCards}
              small
              animate={dealingHoleCards}
              delay={getHoleCardDelay(1)}
            />
          </>
        ) : player.holeCards ? (
          <>
            <Card
              card={player.holeCards[0]}
              hidden={!showCards}
              small
              animate={dealingHoleCards}
              delay={getHoleCardDelay(0)}
            />
            <Card
              card={player.holeCards[1]}
              hidden={!showCards}
              small
              animate={dealingHoleCards}
              delay={getHoleCardDelay(1)}
            />
          </>
        ) : gameStarted ? (
          // 游戏已开始但没有手牌信息，显示背面卡（表示已有手牌）
          <>
            <Card card={{ suit: '♠', rank: 'A' } as any} hidden={true} small animate={dealingHoleCards} delay={getHoleCardDelay(0)} />
            <Card card={{ suit: '♠', rank: 'A' } as any} hidden={true} small animate={dealingHoleCards} delay={getHoleCardDelay(1)} />
          </>
        ) : (
          // 游戏未开始，显示空白卡
          <>
            <Card card={null} small />
            <Card card={null} small />
          </>
        )}
      </div>

      {/* 当前下注 */}
      {player.currentBet > 0 && (
        <div className="player-bet">
          <span>下注: {player.currentBet}</span>
        </div>
      )}
    </div>
  );
};
