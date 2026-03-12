import React, { useMemo } from 'react';
import { PokerTable } from '../../components/PokerTable';
import { GameLog } from '../../components/GameLog';
import { ProfitHistory } from '../../components/ProfitHistory';
import { useGameStore } from '../../store/gameStore';

export const Game: React.FC = () => {
  const { room, gameState, gameLogs, profitHistory } = useGameStore();

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

  return (
    <div className="game-page">
      <PokerTable />

      {/* 盈亏历史 - 左侧 */}
      <ProfitHistory history={profitHistory} />

      {/* 游戏信息滚动显示 - 右侧 */}
      <GameLog entries={gameLogs} playerNames={playerNames} />
    </div>
  );
};
