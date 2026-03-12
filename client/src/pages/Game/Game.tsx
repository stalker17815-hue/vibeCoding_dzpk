import React, { useMemo, useState } from 'react';
import { PokerTable } from '../../components/PokerTable';
import { GameLog } from '../../components/GameLog';
import { ProfitHistory } from '../../components/ProfitHistory';
import { useGameStore } from '../../store/gameStore';
import { useGame } from '../../hooks/useGame';
import './Game.css';

export const Game: React.FC = () => {
  const { room, gameState, gameLogs, profitHistory, playerId, error } = useGameStore();
  const { playerAction, startGame, leaveRoom } = useGame();
  const [actionInProgress, setActionInProgress] = useState(false);

  if (!room) return null;

  // 构建玩家名称映射
  const playerNames = useMemo(() => {
    const names: Record<number, string> = {};
    const players = gameState?.players || room.players;
    players.forEach(p => {
      names[p.seatIndex] = p.name;
    });
    return names;
  }, [gameState?.players, room.players]);

  // 计算行动相关的数据
  const players = gameState?.players || room.players;
  const myPlayer = players.find(p => p.id === playerId);

  const maxBet = Math.max(...players.map(p => p.currentBet), 0);
  const myCurrentBet = myPlayer?.currentBet || 0;
  const callAmount = maxBet - myCurrentBet;

  const canCheck = myCurrentBet >= maxBet;
  const canCall = callAmount > 0 && callAmount <= (myPlayer?.chips || 0);
  const callAndRaiseAmount = callAmount + (gameState?.minRaise || 0);
  const canRaise = (myPlayer?.chips || 0) >= callAndRaiseAmount;
  const maxExtraRaise = Math.min((myPlayer?.chips || 0) - callAmount, 1000);
  const canAllIn = (myPlayer?.chips || 0) > 0;

  const handleAction = (action: any, amount?: number) => {
    setActionInProgress(true);
    playerAction(action, amount);
  };

  // 当收到新的游戏状态时，重置行动状态
  React.useEffect(() => {
    if (gameState) {
      setActionInProgress(false);
    }
  }, [gameState?.currentPlayerSeat]);

  // 当出现错误时，也重置行动状态
  React.useEffect(() => {
    if (error) {
      setActionInProgress(false);
    }
  }, [error]);

  return (
    <div className="game-page">
      {/* 左侧边栏 */}
      <div className="game-sidebar">
        {/* 盈亏历史 */}
        <ProfitHistory history={profitHistory} />
        {/* 游戏日志 */}
        <GameLog entries={gameLogs} playerNames={playerNames} />
      </div>

      {/* 右侧区域 */}
      <div className="game-table-wrapper">
        <PokerTable
          onStartGame={startGame}
          onLeaveRoom={leaveRoom}
          canCheck={canCheck}
          canCall={canCall}
          canRaise={canRaise}
          canAllIn={canAllIn}
          minRaise={gameState?.minRaise || room.bb}
          maxRaise={maxExtraRaise}
          onAction={handleAction}
          actionDisabled={actionInProgress}
        />
      </div>
    </div>
  );
};
