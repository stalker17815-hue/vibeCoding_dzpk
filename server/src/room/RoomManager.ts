import { Room, Player, AILv, PlayerType } from '../types';

// 生成6位房间码
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字符
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 生成玩家ID
function generatePlayerId(): string {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId
  private codeToRoom: Map<string, string> = new Map(); // code -> roomId

  // 创建房间
  createRoom(hostName: string, sb: number = 10, bb: number = 20): { room: Room, playerId: string } {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    let code = generateRoomCode();

    // 确保code唯一
    while (this.codeToRoom.has(code)) {
      code = generateRoomCode();
    }

    const hostId = generatePlayerId();
    const host: Player = {
      id: hostId,
      name: hostName,
      type: 'human',
      chips: 10000,
      holeCards: null,
      status: 'active',
      currentBet: 0,
      totalBet: 0,
      isHost: true,
      seatIndex: 0
    };

    const room: Room = {
      id: roomId,
      code,
      hostId,
      players: [host],
      maxPlayers: 5,
      sb,
      bb,
      status: 'waiting',
      pot: 0,
      sidePots: [],
      communityCards: [],
      currentPhase: 'preflop',
      // buttonSeat 已移除
      currentPlayerSeat: 0,
      deck: [],
      minRaise: bb
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);
    this.codeToRoom.set(code, roomId);

    return { room, playerId: hostId };
  }

  // 加入房间
  joinRoom(code: string, playerName: string): { room: Room | null, playerId: string | null, error?: string } {
    const roomId = this.codeToRoom.get(code.toUpperCase());
    if (!roomId) {
      return { room: null, playerId: null, error: '房间不存在' };
    }

    const room = this.rooms.get(roomId)!;
    if (room.status !== 'waiting') {
      return { room: null, playerId: null, error: '游戏已开始，无法加入' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { room: null, playerId: null, error: '房间已满' };
    }

    // 检查名字是否重复
    if (room.players.some(p => p.name === playerName)) {
      return { room: null, playerId: null, error: '用户名已存在' };
    }

    const playerId = generatePlayerId();
    const seatIndex = this.getNextSeatIndex(room);

    const player: Player = {
      id: playerId,
      name: playerName,
      type: 'human',
      chips: 10000,
      holeCards: null,
      status: 'active',
      currentBet: 0,
      totalBet: 0,
      isHost: false,
      seatIndex
    };

    room.players.push(player);
    this.playerRooms.set(playerId, roomId);

    return { room, playerId };
  }

  // 离开房间
  leaveRoom(playerId: string): { roomId: string | null, newHostId: string | null } {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return { roomId: null, newHostId: null };

    const room = this.rooms.get(roomId)!;
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    if (playerIndex === -1) {
      this.playerRooms.delete(playerId);
      return { roomId, newHostId: null };
    }

    const wasHost = room.players[playerIndex].isHost;
    room.players.splice(playerIndex, 1);
    this.playerRooms.delete(playerId);

    // 房主离开
    if (wasHost && room.players.length > 0) {
      // 移交给下一个真人玩家
      const nextHuman = room.players.find(p => p.type === 'human');
      if (nextHuman) {
        nextHuman.isHost = true;
        room.hostId = nextHuman.id;
      } else {
        // 没有真人玩家，销毁房间
        this.destroyRoom(roomId);
        return { roomId, newHostId: null };
      }
    }

    // 房间空了，销毁
    if (room.players.length === 0) {
      this.destroyRoom(roomId);
    }

    return { roomId, newHostId: room.hostId };
  }

  // 添加AI玩家
  addAI(roomId: string, aiLevel: AILv): Player | null {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return null;

    if (room.players.length >= room.maxPlayers) return null;

    const seatIndex = this.getNextSeatIndex(room);
    const aiNames = ['小智', '小红', '小明', '阿尔法', '德州大师'];
    const usedNames = room.players.map(p => p.name);
    const availableNames = aiNames.filter(n => !usedNames.includes(n));
    const name = availableNames[0] || `AI${room.players.length + 1}`;

    const aiPlayer: Player = {
      id: 'ai_' + Math.random().toString(36).substr(2, 9),
      name,
      type: 'ai',
      aiLevel,
      chips: 10000,
      holeCards: null,
      status: 'active',
      currentBet: 0,
      totalBet: 0,
      isHost: false,
      seatIndex
    };

    room.players.push(aiPlayer);
    return aiPlayer;
  }

  // 踢出玩家
  kickPlayer(roomId: string, playerSeat: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.seatIndex === playerSeat);
    if (!player || player.isHost || player.type === 'human') return false;

    room.players = room.players.filter(p => p.seatIndex !== playerSeat);
    return true;
  }

  // 设置盲注
  setBlind(roomId: string, sb: number, bb: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return false;
    if (bb !== sb * 2) return false; // BB必须是SB的2倍

    room.sb = sb;
    room.bb = bb;
    room.minRaise = bb;
    return true;
  }

  // 获取房间
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  // 通过房间码获取房间
  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoom.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  // 通过玩家ID获取房间
  getRoomByPlayer(playerId: string): Room | undefined {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  // 更新房间
  updateRoom(room: Room): void {
    this.rooms.set(room.id, room);
  }

  // 销毁房间
  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.codeToRoom.delete(room.code);
      for (const player of room.players) {
        this.playerRooms.delete(player.id);
      }
      this.rooms.delete(roomId);
    }
  }

  // 获取下一个座位索引
  private getNextSeatIndex(room: Room): number {
    const usedSeats = new Set(room.players.map(p => p.seatIndex));
    for (let i = 0; i < room.maxPlayers; i++) {
      if (!usedSeats.has(i)) return i;
    }
    return room.players.length;
  }

  // 检查所有真人玩家是否离线
  hasHumanPlayers(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.players.some(p => p.type === 'human' && p.status !== 'disconnected');
  }
}

export const roomManager = new RoomManager();
