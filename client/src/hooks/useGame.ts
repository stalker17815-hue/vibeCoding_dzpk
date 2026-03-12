import { useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import { useGameStore, type ActionType, type AILv, type Card } from '../store/gameStore';

// 辅助函数：将手牌类型转换为中文
const getHandTypeName = (handType: string): string => {
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

export function useGame() {
  const { socket, isConnected, emit } = useSocket();
  const {
    room,
    playerId,
    gameState,
    isLoading,
    error,
    setRoom,
    setPlayerId,
    setGameState,
    setMyCards,
    setIsLoading,
    setError,
    setShowdownResults,
    setWinners,
    setShuffling,
    setDealingHoleCards,
    setRecentDeal,
    setRecentBlind,
    addGameLog,
    addProfitRecord,
    setAIThinking,
    reset,
  } = useGameStore();

  // 设置Socket事件监听
  useEffect(() => {
    if (!socket) return;

    // 房间事件 - 使用 .once 确保只执行一次
    socket.once('room:created', (newRoom: any, newPlayerId: string) => {
      console.log('[Client] Received room:created, playerId:', newPlayerId);
      setRoom(newRoom);
      setPlayerId(newPlayerId);
      setIsLoading(false);
    });

    socket.once('room:joined', (newRoom: any, newPlayerId: string) => {
      console.log('[Client] Received room:joined');
      setRoom(newRoom);
      setPlayerId(newPlayerId);
      setIsLoading(false);
    });

    // 游戏事件 - 使用稳定的引用
    const handleRoomUpdated = (newRoom: any) => {
      console.log('[Client] Received room:updated, status:', newRoom.status);
      setRoom(newRoom);
    };

    const handleRoomLeft = () => {
      console.log('[Client] Received room:left');
      reset();
    };

    const handleRoomError = (error: string) => {
      console.log('[Client] Received room:error:', error);
      setError(error);
      setIsLoading(false);
    };

    const handleGameStarted = () => {
      console.log('[Client] Received game:started');
      setShowdownResults(null);
      setWinners(null);
    };

    const handleGameState = (state: any) => {
      try {
        console.log('[Client] Received game:state, phase:', state?.phase, 'currentPlayerSeat:', state?.currentPlayerSeat);
        setGameState(state);

        // 更新我的手牌
        const currentPlayerId = useGameStore.getState().playerId;
        if (currentPlayerId && state.players) {
          const me = state.players.find((p: any) => p.id === currentPlayerId);
          if (me && me.holeCards) {
            setMyCards(me.holeCards);
          }
        }
        console.log('[Client] game:state handled successfully');
      } catch (err) {
        console.error('[Client] Error handling game:state:', err);
      }
    };

    const handleGamePhase = (data: { phase: string; communityCards: any[] }) => {
      console.log('[Client] Received game:phase:', data.phase, 'communityCards:', JSON.stringify(data.communityCards));
      const currentGameState = useGameStore.getState().gameState;
      if (currentGameState) {
        setGameState({
          ...currentGameState,
          phase: data.phase as any,
          communityCards: data.communityCards,
        });
      }
    };

    const handleGameShowdown = (data: any) => {
      console.log('[Client] Received game:showdown', data);
      setShowdownResults(data);

      // 记录所有玩家的盈亏
      const allPlayersProfit = data.players.map((p: any) => {
        const profit = p.winAmount - p.currentBet;
        const handTypeName = p.hand?.type ? getHandTypeName(p.hand.type) : undefined;
        return {
          name: p.playerName,
          profit,
          handType: handTypeName
        };
      });

      // 记录到左侧盈亏历史
      addProfitRecord(allPlayersProfit);

      // 添加摊牌历史记录
      const winners = data.players.filter((p: any) => p.isWinner);

      if (winners.length > 0) {
        const winnerNames = winners.map((w: any) => w.playerName).join('、');
        const totalPot = winners.reduce((sum: number, w: any) => sum + w.winAmount, 0);
        addGameLog(`【结算】${winnerNames} 获胜，赢得 ${totalPot} 筹码`, 'game');
      }
    };

    const handleGameWinner = (winners: any[]) => {
      console.log('[Client] Received game:winner');
      setWinners(winners);
    };

    const handleGameEnded = () => {
      console.log('[Client] Received game:ended');
      const currentRoom = useGameStore.getState().room;
      if (currentRoom) {
        setRoom({ ...currentRoom, status: 'ended' });
        // 游戏结束，显示提示
        const remainingPlayers = currentRoom.players.filter(p => p.chips > 0).length;
        if (remainingPlayers < 2) {
          setError(`游戏结束！剩余玩家不足 ${remainingPlayers < 1 ? '1' : '2'} 人，无法继续游戏`);
        } else {
          setError('游戏已结束');
        }
      }
    };

    const handlePlayerTimeout = () => {
      console.log('[Client] Received player:timeout');
      setError('你的思考时间已到，已自动弃牌');
    };

    // 洗牌事件
    const handleGameShuffle = (data: { duration: number }) => {
      console.log('[Client] Received game:shuffle, duration:', data.duration);
      setShuffling(true);
      // 动画结束后自动取消
      setTimeout(() => {
        setShuffling(false);
      }, data.duration);
    };

    // 发牌事件
    const handleGameDeal = (data: { playerSeat: number; cardIndex: number; card: Card }) => {
      console.log('[Client] Received game:deal:', data);
      setDealingHoleCards(true);
      setRecentDeal(data);

      // 更新玩家手牌
      const currentGameState = useGameStore.getState().gameState;
      if (currentGameState) {
        const updatedPlayers = currentGameState.players.map(p => {
          if (p.seatIndex === data.playerSeat) {
            const holeCards = p.holeCards ? [...p.holeCards] : [null as unknown as Card, null as unknown as Card];
            holeCards[data.cardIndex] = data.card;
            return { ...p, holeCards: holeCards as [Card, Card] };
          }
          return p;
        });
        setGameState({ ...currentGameState, players: updatedPlayers });

        // 如果是自己，更新手牌
        const currentPlayerId = useGameStore.getState().playerId;
        const me = updatedPlayers.find(p => p.id === currentPlayerId);
        if (me && me.holeCards) {
          setMyCards(me.holeCards);
        }
      }

      // 延迟后清除发牌状态
      setTimeout(() => {
        setRecentDeal(null);
      }, 500);
    };

    // 盲注事件
    const handleGameBlind = (data: { playerSeat: number; amount: number; blindType: 'sb' | 'bb' }) => {
      console.log('[Client] Received game:blind:', data);
      setRecentBlind(data);

      // 获取玩家名称
      const currentGameState = useGameStore.getState().gameState;
      const player = currentGameState?.players.find(p => p.seatIndex === data.playerSeat);
      const playerName = player?.name || `玩家${data.playerSeat + 1}`;
      const blindTypeName = data.blindType === 'sb' ? '小盲' : '大盲';

      // 添加日志
      addGameLog(`${playerName} 下注${blindTypeName} ${data.amount}`, 'action', data.playerSeat);

      // 更新玩家状态
      if (currentGameState) {
        const updatedPlayers = currentGameState.players.map(p => {
          if (p.seatIndex === data.playerSeat) {
            return {
              ...p,
              chips: p.chips - data.amount,
              currentBet: p.currentBet + data.amount
            };
          }
          return p;
        });

        // 更新底池
        const newPot = currentGameState.pot + data.amount;

        setGameState({
          ...currentGameState,
          players: updatedPlayers,
          pot: newPot
        });
      }

      // 延迟后清除盲注状态
      setTimeout(() => {
        setRecentBlind(null);
      }, 1000);
    };

    // 玩家行动事件
    const handleGameAction = (data: { playerSeat: number; action: string; amount: number }) => {
      console.log('[Client] Received game:action:', data);

      // 获取玩家名称
      const currentGameState = useGameStore.getState().gameState;
      const player = currentGameState?.players.find(p => p.seatIndex === data.playerSeat);
      const playerName = player?.name || `玩家${data.playerSeat + 1}`;

      const actionNames: Record<string, string> = {
        fold: '弃牌',
        check: '过牌',
        call: '跟注',
        raise: '加注',
        all_in: '全下',
      };

      const actionText = actionNames[data.action] || data.action;
      const amountText = data.amount > 0 ? ` ${data.amount}` : '';

      // 添加日志
      addGameLog(`${playerName} ${actionText}${amountText}`, 'action', data.playerSeat);
    };

    // AI思考事件
    const handleGameAIThinking = (data: { playerSeat: number; thinkTime: number }) => {
      console.log('[Client] Received game:ai-thinking:', data);
      setAIThinking(data);

      // 获取玩家名称
      const currentGameState = useGameStore.getState().gameState;
      const player = currentGameState?.players.find(p => p.seatIndex === data.playerSeat);
      const playerName = player?.name || `玩家${data.playerSeat + 1}`;

      // 添加思考日志
      addGameLog(`${playerName} 正在思考...`, 'game', data.playerSeat);
    };

    // 处理收到个人手牌
    const handleHoleCards = (holeCards: [Card, Card]) => {
      console.log('[Client] Received hole cards:', holeCards);
      setMyCards(holeCards);
    };

    // 处理行动结果（成功/失败）
    const handleActionResult = (success: boolean, error?: string) => {
      console.log('[Client] Received action result:', success, error);
      if (!success && error) {
        setError(error);
      }
    };

    // 绑定事件
    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:left', handleRoomLeft);
    socket.on('room:error', handleRoomError);
    socket.on('game:started', handleGameStarted);
    socket.on('game:state', handleGameState);
    socket.on('game:phase', handleGamePhase);
    socket.on('game:showdown', handleGameShowdown);
    socket.on('game:winner', handleGameWinner);
    socket.on('game:ended', handleGameEnded);
    socket.on('player:timeout', handlePlayerTimeout);
    socket.on('game:shuffle', handleGameShuffle);
    socket.on('game:deal', handleGameDeal);
    socket.on('game:blind', handleGameBlind);
    socket.on('game:action', handleGameAction);
    socket.on('game:ai-thinking', handleGameAIThinking);
    socket.on('game:hole-cards', handleHoleCards);
    socket.on('game:action-result', handleActionResult);

    return () => {
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:left', handleRoomLeft);
      socket.off('room:error', handleRoomError);
      socket.off('game:started', handleGameStarted);
      socket.off('game:state', handleGameState);
      socket.off('game:phase', handleGamePhase);
      socket.off('game:showdown', handleGameShowdown);
      socket.off('game:winner', handleGameWinner);
      socket.off('game:ended', handleGameEnded);
      socket.off('player:timeout', handlePlayerTimeout);
      socket.off('game:shuffle', handleGameShuffle);
      socket.off('game:deal', handleGameDeal);
      socket.off('game:blind', handleGameBlind);
      socket.off('game:action', handleGameAction);
      socket.off('game:ai-thinking', handleGameAIThinking);
      socket.off('game:hole-cards', handleHoleCards);
      socket.off('game:action-result', handleActionResult);
    };
  }, [socket]);

  // 创建房间
  const createRoom = useCallback((playerName: string, sb: number = 10, bb: number = 20) => {
    if (!isConnected) {
      setError('未连接到服务器');
      return;
    }
    setIsLoading(true);
    setError(null);
    emit('room:create', { playerName, sb, bb });
  }, [isConnected, emit, setError, setIsLoading]);

  // 加入房间
  const joinRoom = useCallback((code: string, playerName: string) => {
    if (!isConnected) {
      setError('未连接到服务器');
      return;
    }
    setIsLoading(true);
    setError(null);
    emit('room:join', { code, playerName });
  }, [isConnected, emit, setError, setIsLoading]);

  // 离开房间
  const leaveRoom = useCallback(() => {
    if (!room) return;
    emit('room:leave', { roomId: room.id });
    reset();
  }, [room, emit, reset]);

  // 添加AI
  const addAI = useCallback((aiLevel: AILv) => {
    if (!room) return;
    emit('room:add-ai', { roomId: room.id, aiLevel });
  }, [room, emit]);

  // 踢出玩家
  const kickPlayer = useCallback((playerSeat: number) => {
    if (!room) return;
    emit('room:kick', { roomId: room.id, playerSeat });
  }, [room, emit]);

  // 设置盲注
  const setBlind = useCallback((sb: number, bb: number) => {
    if (!room) return;
    emit('room:set-blind', { roomId: room.id, sb, bb });
  }, [room, emit]);

  // 开始游戏
  const startGame = useCallback(() => {
    if (!room) return;
    emit('room:start', { roomId: room.id });
  }, [room, emit]);

  // 玩家行动
  const playerAction = useCallback((action: ActionType, amount?: number) => {
    if (!room) return;
    emit('game:action', { roomId: room.id, action, amount });
  }, [room, emit]);

  return {
    // 状态
    isConnected,
    room,
    playerId,
    gameState,
    isLoading,
    error,

    // 操作
    createRoom,
    joinRoom,
    leaveRoom,
    addAI,
    kickPlayer,
    setBlind,
    startGame,
    playerAction,
  };
}
