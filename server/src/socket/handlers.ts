import { Server, Socket } from 'socket.io';
import { roomManager } from '../room/RoomManager';
import { GameFlow } from '../game/GameFlow';
import { ActionType, AILv } from '../types';

interface PlayerSocket {
  [playerId: string]: string; // playerId -> socketId
}

const playerSockets: PlayerSocket = {};
const roomGames: Map<string, GameFlow> = new Map();

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 房间事件 - 创建房间
    socket.on('room:create', (data: { playerName: string, sb?: number, bb?: number }) => {
      try {
        const sb = data.sb || 10;
        const bb = data.bb || 20;
        const { room, playerId } = roomManager.createRoom(data.playerName, sb, bb);

        playerSockets[playerId] = socket.id;
        socket.data.playerId = playerId;

        socket.join(room.id);
        // 返回 room 和 playerId 给创建者
        socket.emit('room:created', room, playerId);

        // 广播房间更新
        io.to(room.id).emit('room:updated', room);
      } catch (error) {
        console.error('Create room error:', error);
        socket.emit('room:error', '创建房间失败');
      }
    });

    // 加入房间
    socket.on('room:join', (data: { code: string, playerName: string }) => {
      try {
        const { room, playerId, error } = roomManager.joinRoom(data.code, data.playerName);

        if (error || !room || !playerId) {
          socket.emit('room:error', error || '加入房间失败');
          return;
        }

        playerSockets[playerId] = socket.id;
        socket.data.playerId = playerId;

        socket.join(room.id);
        socket.emit('room:joined', room, playerId);

        // 广播房间更新
        io.to(room.id).emit('room:updated', room);
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('room:error', '加入房间失败');
      }
    });

    // 离开房间
    socket.on('room:leave', (data: { roomId: string }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit('room:left', data.roomId);
          return;
        }

        const { roomId: leftRoomId, newHostId } = roomManager.leaveRoom(playerId);

        if (leftRoomId) {
          socket.leave(leftRoomId);
          io.to(leftRoomId).emit('room:left', leftRoomId);

          if (newHostId) {
            const room = roomManager.getRoom(leftRoomId);
            if (room) {
              io.to(leftRoomId).emit('room:updated', room);
            }
          }

          // 检查是否还有真人玩家
          if (!roomManager.hasHumanPlayers(leftRoomId)) {
            const game = roomGames.get(leftRoomId);
            if (game) {
              game.destroy();
              roomGames.delete(leftRoomId);
            }
            roomManager.destroyRoom(leftRoomId);
          }
        }

        delete playerSockets[playerId];
        socket.emit('room:left', data.roomId);
      } catch (error) {
        console.error('Leave room error:', error);
      }
    });

    // 添加AI
    socket.on('room:add-ai', (data: { roomId: string, aiLevel: AILv }) => {
      try {
        const player = roomManager.addAI(data.roomId, data.aiLevel);

        if (!player) {
          socket.emit('room:error', '添加AI失败');
          return;
        }

        const room = roomManager.getRoom(data.roomId);
        if (room) {
          io.to(room.id).emit('room:updated', room);
        }

        socket.emit('room:ai-added', player);
      } catch (error) {
        console.error('Add AI error:', error);
        socket.emit('room:error', '添加AI失败');
      }
    });

    // 踢出玩家
    socket.on('room:kick', (data: { roomId: string, playerSeat: number }) => {
      try {
        const success = roomManager.kickPlayer(data.roomId, data.playerSeat);

        if (success) {
          const room = roomManager.getRoom(data.roomId);
          if (room) {
            io.to(room.id).emit('room:updated', room);
          }
        }

        socket.emit('room:kick-result', success);
      } catch (error) {
        console.error('Kick player error:', error);
        socket.emit('room:kick-result', false);
      }
    });

    // 设置盲注
    socket.on('room:set-blind', (data: { roomId: string, sb: number, bb: number }) => {
      try {
        const success = roomManager.setBlind(data.roomId, data.sb, data.bb);

        if (success) {
          const room = roomManager.getRoom(data.roomId);
          if (room) {
            io.to(room.id).emit('room:updated', room);
          }
        }

        socket.emit('room:set-blind-result', success);
      } catch (error) {
        console.error('Set blind error:', error);
        socket.emit('room:set-blind-result', false);
      }
    });

    // 开始游戏
    socket.on('room:start', (data: { roomId: string }) => {
      console.log('Received room:start', data);
      try {
        const room = roomManager.getRoom(data.roomId);
        if (!room) {
          socket.emit('room:error', '房间不存在');
          return;
        }

        // 检查是否是房主
        const playerId = socket.data.playerId;
        if (room.hostId !== playerId) {
          socket.emit('room:error', '只有房主可以开始游戏');
          return;
        }

        if (room.players.length < 2) {
          socket.emit('room:error', '玩家不足2人，无法开始游戏。请等待其他玩家加入。');
          return;
        }

        // 如果已经有游戏实例，复用它来开始下一手牌
        const existingGame = roomGames.get(room.id);
        if (existingGame) {
          existingGame.startNextHand();
          socket.emit('room:start-result', true);
          return;
        }

        // 创建新的游戏实例
        const game = new GameFlow(room, (event, eventData) => {
          try {
            console.log('[GameFlow] Emitting event:', event, 'data:', JSON.stringify(eventData).slice(0, 100));
            io.to(room.id).emit(event, eventData);
            console.log('[GameFlow] Emitted event:', event, 'success');
          } catch (err) {
            console.error('[GameFlow] Error emitting event:', event, err);
          }
        }, (playerId: string, event: string, data: any) => {
          // 发送事件给特定玩家
          const socketId = playerSockets[playerId];
          if (socketId) {
            io.to(socketId).emit(event, data);
          }
        });

        roomGames.set(room.id, game);

        // 更新房间状态
        room.status = 'playing';
        console.log('[Game] Before updateRoom');
        roomManager.updateRoom(room);
        console.log('[Game] After updateRoom');

        // 广播房间更新
        console.log('[Game] Before emit room:updated');
        io.to(room.id).emit('room:updated', room);
        console.log('[Game] After emit room:updated');

        // 延迟一下再开始游戏，让客户端有时间处理 room:updated
        console.log('[Game] Starting game in 100ms...');
        setTimeout(() => {
          console.log('[Game] Starting game, emitting game:started');
          game.start();
          console.log('[Game] game.start() completed');
        }, 100);

        socket.emit('room:start-result', true);
      } catch (error) {
        console.error('Start game error:', error);
        socket.emit('room:start-result', false, '开始游戏失败');
      }
    });

    // 游戏行动
    socket.on('game:action', (data: { roomId: string, action: ActionType, amount?: number }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit('game:action-result', false, '未加入房间');
          return;
        }

        const game = roomGames.get(data.roomId);
        if (!game) {
          socket.emit('game:action-result', false, '游戏未开始');
          return;
        }

        const success = game.playerAction(playerId, data.action, data.amount);
        // 获取失败原因
        if (!success) {
          const maxBet = game.getMaxBetValue();
          const room = game.getRoom();
          const player = room.players.find(p => p.id === playerId);
          if (player) {
            const callAmount = maxBet - player.currentBet;
            const minRequired = callAmount + room.minRaise;
            if (data.action === 'raise' && player.chips < minRequired) {
              socket.emit('game:action-result', false, `筹码不足，加注至少需要 ${minRequired} 筹码`);
              return;
            }
          }
        }
        socket.emit('game:action-result', success);
      } catch (error) {
        console.error('Game action error:', error);
        socket.emit('game:action-result', false, '操作失败');
      }
    });

    // 断开连接
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      const playerId = socket.data.playerId;
      if (playerId) {
        const room = roomManager.getRoomByPlayer(playerId);
        if (room) {
          const player = room.players.find(p => p.id === playerId);
          if (player && player.type === 'human') {
            player.status = 'disconnected';

            // 如果是房主断开
            if (player.isHost) {
              const { newHostId } = roomManager.leaveRoom(playerId);
              if (newHostId) {
                io.to(room.id).emit('room:updated', room);
              }
            }

            // 检查是否还有真人玩家
            if (!roomManager.hasHumanPlayers(room.id)) {
              const game = roomGames.get(room.id);
              if (game) {
                game.destroy();
                roomGames.delete(room.id);
              }
              roomManager.destroyRoom(room.id);
            }
          }
        }

        delete playerSockets[playerId];
      }
    });
  });
}
