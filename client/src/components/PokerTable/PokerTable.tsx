import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../Card';
import { PlayerSeat } from '../PlayerSeat';
import { ActionPanel } from '../ActionPanel';
import { PotDisplay } from '../PotDisplay';
import { ShuffleAnimation } from '../ShuffleAnimation';
import { useGame } from '../../hooks/useGame';
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

const getPositionClass = (seatIndex: number, playerCount: number): string => {
  const positions: Record<number, string[]> = {
    2: ['bottom-left', 'top'],
    3: ['bottom-left', 'top', 'bottom-right'],
    4: ['bottom-left', 'left', 'top', 'bottom-right'],
    5: ['bottom-left', 'left', 'top', 'right', 'bottom-right'],
  };

  return positions[playerCount]?.[seatIndex] || 'bottom-left';
};

export const PokerTable: React.FC = () => {
  const { room, playerId, gameState, myCards, isShuffling, dealingHoleCards: dealingHoleCardsFromStore, showdownResults, clearGameLogs, error, setError } = useGameStore();
  const { playerAction, startGame, leaveRoom } = useGame();
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

  const maxBet = Math.max(...players.map(p => p.currentBet), 0);
  const myCurrentBet = myPlayer?.currentBet || 0;
  const callAmount = maxBet - myCurrentBet;

  const canCheck = myCurrentBet >= maxBet;
  const canCall = callAmount > 0 && callAmount <= (myPlayer?.chips || 0);
  // 加注需要：需要跟注的金额 + 最小加注额
  // 可用于额外加注的筹码 = 玩家筹码 - 需要跟注的金额
  const callAndRaiseAmount = callAmount + (gameState?.minRaise || 0);
  const canRaise = (myPlayer?.chips || 0) >= callAndRaiseAmount;
  // 单次下注上限为1000
  const maxExtraRaise = Math.min((myPlayer?.chips || 0) - callAmount, 1000); // 额外加注的最大金额
  const canAllIn = (myPlayer?.chips || 0) > 0;

  // 玩家是否正在行动（等待服务端响应）
  const [actionInProgress, setActionInProgress] = useState(false);

  const handleAction = (action: any, amount?: number) => {
    // 禁用按钮，防止重复点击
    setActionInProgress(true);
    playerAction(action, amount);
  };

  // 当收到新的游戏状态时，重置行动状态
  useEffect(() => {
    if (gameState) {
      setActionInProgress(false);
    }
  }, [gameState?.currentPlayerSeat]);

  // 当出现错误时，也重置行动状态（让玩家可以重新选择）
  useEffect(() => {
    if (error) {
      setActionInProgress(false);
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

  return (
    <div className="poker-table-container">
      {/* 洗牌动画 */}
      <ShuffleAnimation isActive={isShuffling} />

      <div className="poker-table">
        {/* 房间信息 */}
        <div className="room-info">
          <span className="room-code">房间号: {room.code}</span>
          <span className="game-phase">{gameState?.phase ? `【${gameState.phase.toUpperCase()}】` : ''}</span>
          <span className="blind-info">盲注: {room.sb}/{room.bb}</span>
          {currentPlayer && (
            <span className="current-player">
              当前: {currentPlayer.name}
              {currentPlayer.type === 'ai' ? '(AI)' : ''}
              {isMyTurn && <span className="countdown">{countdown}s</span>}
            </span>
          )}
          {error && (
            <span className="error-message" onClick={() => setError(null)}>
              {error}
            </span>
          )}
        </div>

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

        {/* 摊牌结果 - 详细列表 */}
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
                    {p.status === 'folded' && ' (已弃牌)'}
                    {p.status === 'all_in' && ' (全下)'}
                  </div>
                  <div className="player-bet">下注: {p.currentBet}</div>
                  {p.hand && (
                    <div className="player-hand">牌型: {getHandName(p.hand.type)}</div>
                  )}
                  {p.isWinner && (
                    <div className="player-win">+{p.winAmount} 筹码</div>
                  )}
                  {/* 底牌 */}
                  {p.cards && p.status !== 'folded' && (
                    <div className="player-hole-cards">
                      <span className="cards-label">底牌:</span>
                      <div className="cards-display">
                        <Card card={p.cards[0]} small />
                        <Card card={p.cards[1]} small />
                      </div>
                    </div>
                  )}
                  {/* 组成的最佳牌型 (5张) */}
                  {p.hand?.handCards && p.hand.handCards.length > 0 && (
                    <div className="player-best-hand">
                      <span className="cards-label">组牌:</span>
                      <div className="cards-display">
                        {p.hand.handCards.map((card, idx) => (
                          <Card key={idx} card={card} small />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* 房主开始下一局按钮 */}
            {playerId === room?.hostId && (
              <button className="next-hand-btn" onClick={() => {
                // 清空右侧当前游戏日志，重新开始记录
                clearGameLogs();
                // 开始下一局
                startGame();
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
                leaveRoom();
              }}>
                退出房间
              </button>
            )}
          </div>
        )}

        {/* 玩家座位 */}
        {players.map((player) => {
          const position = getPositionClass(player.seatIndex, players.length);
          const isMe = player.id === playerId;

          // 已移除庄家、小盲、大盲概念

          return (
            <PlayerSeat
              key={player.id}
              player={player}
              isCurrentPlayer={gameState?.currentPlayerSeat === player.seatIndex}
              isMe={isMe}
              showCards={isMe ? showMyCards : (gameState?.phase === 'showdown' || room.status === 'ended')}
              position={position as any}
              gameStarted={room.status === 'playing'}
              dealingHoleCards={dealingHoleCardsFromStore}
              seatIndex={player.seatIndex}
              myHoleCards={isMe ? myCards : null}
            />
          );
        })}

        {/* 调试信息 */}
        <div className="debug-info">
          <div>room.status: {room.status}</div>
          <div>currentPlayerSeat: {gameState?.currentPlayerSeat}</div>
          <div>myPlayer: {myPlayer ? `${myPlayer.name} (seat ${myPlayer.seatIndex}, status ${myPlayer.status})` : 'null'}</div>
          <div>isMyTurn: {isMyTurn ? 'true' : 'false'}</div>
          <div>lastAction: {gameState?.lastAction ? `${gameState.lastAction.action} by seat ${gameState.lastAction.playerSeat}` : 'null'}</div>
        </div>

        {/* 行动面板 - 简化条件，只要轮到我就显示 */}
        {room.status === 'playing' && isMyTurn && (
          <div className="action-area">
            <ActionPanel
              canCheck={canCheck}
              canCall={canCall}
              canRaise={canRaise}
              canAllIn={canAllIn}
              minRaise={gameState?.minRaise || room.bb}
              maxRaise={maxExtraRaise}
              onAction={handleAction}
              disabled={actionInProgress}
            />
          </div>
        )}
      </div>
    </div>
  );
};
