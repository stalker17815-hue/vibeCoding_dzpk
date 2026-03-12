import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../Card';
import { PlayerSeat } from '../PlayerSeat';
import { ActionPanel } from '../ActionPanel';
import { PotDisplay } from '../PotDisplay';
import { ShuffleAnimation } from '../ShuffleAnimation';
import './PokerTable.css';

// 辅助函数：将手牌类型转换为中文
const getHandName = (handType: string): string => {
  const handNames: Record<string, string> = {
    'royal_flush': '皇家同花顺',
    'straight_flush': '同花顺',
    'four_of_a_kind': '四条',
    'full_house': '葫芦',
    'flush': '同花',
    'straight': '顺子',
    'three_of_a_kind': '三条',
    'two_pair': '两对',
    'one_pair': '一对',
    'high_card': '高牌'
  };
  return handNames[handType] || handType;
};

// 辅助函数：将游戏阶段转换为中文
const getPhaseName = (phase: string): string => {
  const phaseNames: Record<string, string> = {
    'preflop': '翻牌前',
    'flop': '翻牌',
    'turn': '转牌',
    'river': '河牌',
    'showdown': '摊牌',
    'finished': '结束'
  };
  return phaseNames[phase] || phase;
};

interface PokerTableProps {
  onStartGame?: () => void;
  onLeaveRoom?: () => void;
  // Action panel props
  canCheck?: boolean;
  canCall?: boolean;
  canRaise?: boolean;
  canAllIn?: boolean;
  minRaise?: number;
  maxRaise?: number;
  onAction?: (action: any, amount?: number) => void;
  actionDisabled?: boolean;
}

export const PokerTable: React.FC<PokerTableProps> = ({
  onStartGame,
  onLeaveRoom,
  canCheck,
  canCall,
  canRaise,
  canAllIn,
  minRaise,
  maxRaise,
  onAction,
  actionDisabled,
}) => {
  const { room, playerId, gameState, myCards, isShuffling, dealingHoleCards: dealingHoleCardsFromStore, showdownResults, clearGameLogs, error, setError } = useGameStore();
  const prevCommunityCount = useRef(0);
  const [dealingCards, setDealingCards] = useState<number[]>([]);

  // 检测新发的公共牌并触发动画
  useEffect(() => {
    const currentCount = gameState?.communityCards?.length || 0;
    if (currentCount > prevCommunityCount.current && currentCount > 0) {
      // 新发了牌，触发动画
      const newCardIndices = [];
      for (let i = prevCommunityCount.current; i < currentCount; i++) {
        newCardIndices.push(i);
      }
      setDealingCards(newCardIndices);
      // 动画完成后清除
      setTimeout(() => setDealingCards([]), 1000);
    }
    prevCommunityCount.current = currentCount;
  }, [gameState?.communityCards?.length, gameState?.phase]);

  if (!room) return null;

  const players = gameState?.players || room.players;
  const myPlayer = players.find(p => p.id === playerId);

  const isMyTurn = gameState?.currentPlayerSeat !== undefined &&
    myPlayer !== undefined &&
    myPlayer.seatIndex === gameState.currentPlayerSeat;

  // 当收到新的游戏状态时，重置行动状态
  useEffect(() => {
    if (gameState) {
      // Reset action in progress if needed
    }
  }, [gameState?.currentPlayerSeat]);

  // 当出现错误时，也重置行动状态（让玩家可以重新选择）
  useEffect(() => {
    if (error) {
      // Reset on error if needed
    }
  }, [error]);

  // 获取手牌是否可见（只要有牌且未弃牌就显示）
  const showMyCards = myCards !== null && myPlayer?.status !== 'folded';

  // 倒计时
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (isMyTurn && room.status === 'playing') {
      setCountdown(30);
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isMyTurn, gameState?.currentPlayerSeat, room.status]);

  // 获取当前行动玩家信息
  const currentPlayer = gameState?.currentPlayerSeat !== undefined
    ? players.find(p => p.seatIndex === gameState.currentPlayerSeat)
    : null;

  // 渲染公共牌
  const communityCards = gameState?.communityCards || [];

  const getSeatLayoutClass = (count: number): string => {
    return `seat-layout-${Math.min(count, 6)}`;
  };

  return (
    <div className="poker-table-container">
      {/* 洗牌动画 */}
      <ShuffleAnimation isActive={isShuffling} />

      <div className="poker-table">
        {/* 顶部信息栏 */}
        <div className="table-header">
          <div className="room-info">
            <span className="room-code">房间 {room.code}</span>
            {gameState?.phase && (
              <span className="game-phase">{getPhaseName(gameState.phase)}</span>
            )}
            <span className="blind-info">{room.sb}/{room.bb}</span>
            {currentPlayer && (
              <span className="current-player">
                {currentPlayer.name}
                {currentPlayer.type === 'ai' && ' (AI)'}
                {isMyTurn && <span className="countdown">{countdown}s</span>}
              </span>
            )}
            {error && (
              <span className="error-message" onClick={() => setError(null)}>
                {error}
              </span>
            )}
          </div>
        </div>

        {/* 中间游戏区域 */}
        <div className="table-center">
          <div className="poker-table-surface">
            {/* 公共牌区域 */}
            <div className="community-cards">
              {communityCards.map((card, index) => (
                <Card key={index} card={card} animate={dealingCards.includes(index)} />
              ))}
              {/* 空白位置 */}
              {communityCards.length < 5 && Array(5 - communityCards.length).fill(null).map((_, i) => (
                <Card key={`empty-${i}`} card={null} />
              ))}
            </div>

            {/* 底池显示 */}
            <div className="pot-area">
              <PotDisplay pot={gameState?.pot || 0} sidePots={gameState?.sidePots || []} />
            </div>
          </div>

          {/* 玩家座位环绕 */}
          <div className={`players-ring ${getSeatLayoutClass(players.length)}`}>
            {players.map((player) => {
              const isMe = player.id === playerId;
              return (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  isCurrentPlayer={gameState?.currentPlayerSeat === player.seatIndex}
                  isMe={isMe}
                  showCards={isMe ? showMyCards : (gameState?.phase === 'showdown' || room.status === 'ended')}
                  gameStarted={room.status === 'playing'}
                  dealingHoleCards={dealingHoleCardsFromStore}
                  seatIndex={player.seatIndex}
                  myHoleCards={isMe ? myCards : null}
                />
              );
            })}
          </div>

        </div>

        {/* 行动面板 - 使用绝对定位，不影响其他元素 */}
        {room.status === 'playing' && isMyTurn && (
          <div className="inline-action-panel">
            <ActionPanel
              canCheck={canCheck || false}
              canCall={canCall || false}
              canRaise={canRaise || false}
              canAllIn={canAllIn || false}
              minRaise={minRaise || room.bb}
              maxRaise={maxRaise || 0}
              onAction={onAction || (() => {})}
              disabled={actionDisabled || false}
            />
          </div>
        )}

        {/* 摊牌结果 */}
        {showdownResults && (
          <div className="showdown-result">
            <div className="showdown-title">摊牌结果</div>

            {/* 公共牌展示 */}
            <div className="showdown-community">
              <span className="community-label">公共牌:</span>
              <div className="community-cards-display">
                {showdownResults.communityCards.map((card, index) => (
                  <Card key={index} card={card} small />
                ))}
              </div>
            </div>

            <div className="showdown-list">
              {showdownResults.players.map((p, index) => (
                <div key={index} className={`showdown-player ${p.isWinner ? 'winner' : ''} ${p.status === 'folded' ? 'folded' : ''}`}>
                  <div className="player-name">
                    {p.isWinner && '🏆 '}
                    {p.playerName}
                  </div>
                  {p.hand && (
                    <div className="player-hand">{getHandName(p.hand.type)}</div>
                  )}
                  <div className="player-cards-info">
                    {p.cards && p.status !== 'folded' && (
                      <div className="player-hole-cards">
                        <span className="cards-label">底牌</span>
                        <div className="cards-display">
                          <Card card={p.cards[0]} small />
                          <Card card={p.cards[1]} small />
                        </div>
                      </div>
                    )}
                    {p.hand?.handCards && p.hand.handCards.length > 0 && (
                      <div className="player-best-hand">
                        <span className="cards-label">组牌</span>
                        <div className="cards-display">
                          {p.hand.handCards.map((card, idx) => (
                            <Card key={idx} card={card} small />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {p.isWinner && (
                    <div className="player-win">+{p.winAmount}</div>
                  )}
                </div>
              ))}
            </div>
            {playerId === room?.hostId && (
              <button className="next-hand-btn" onClick={() => {
                clearGameLogs();
                if (onStartGame) onStartGame();
              }}>
                开始下一局
              </button>
            )}
          </div>
        )}

        {/* 游戏结束消息 */}
        {room.status === 'ended' && !showdownResults && (
          <div className="game-over-message">
            <div className="game-over-title">游戏结束</div>
            <div className="game-over-text">房间内剩余玩家不足，无法继续游戏</div>
            {playerId === room?.hostId && (
              <button className="restart-btn" onClick={() => {
                if (onLeaveRoom) onLeaveRoom();
              }}>
                退出房间
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
