// 扑克牌花色
export type Suit = '♠' | '♥' | '♦' | '♣';

// 扑克牌点数
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

// 牌型
export type HandType =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'one_pair'
  | 'high_card';

export interface HandResult {
  type: HandType;
  rank: number; // 用于比较相同牌型的大小
  kickers: number[]; // 踢脚牌
  handCards?: Card[]; // 构成最佳手牌的5张牌
}

// 玩家行动
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

// 游戏轮次
export type GamePhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

// 玩家状态
export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'disconnected';

// 玩家类型
export type PlayerType = 'human' | 'ai';

// AI等级
export type AILv = 1 | 2 | 3;

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  aiLevel?: AILv;
  chips: number;
  holeCards: [Card, Card] | null;
  status: PlayerStatus;
  currentBet: number;  // 当前轮下注
  totalBet: number;    // 本手牌总下注（累加各轮）
  isHost: boolean;
  seatIndex: number; // 0-5 对应座位
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  sb: number; // 小盲
  bb: number; // 大盲
  status: 'waiting' | 'playing' | 'ended';
  pot: number;
  sidePots: number[];
  communityCards: Card[];
  currentPhase: GamePhase;
  // buttonSeat 已移除（庄家概念）
  currentPlayerSeat: number; // 当前行动玩家
  deck: Card[];
  minRaise: number;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  pot: number;
  sidePots: number[];
  communityCards: Card[];
  currentPlayerSeat: number;
  players: Player[];
  // buttonSeat 已移除
  lastAction: ActionType | null;
  lastBet: number;
  minRaise: number;
}

// Socket事件类型
export interface ServerToClientEvents {
  'room:created': (room: Room, playerId: string) => void;
  'room:joined': (room: Room, playerId: string) => void;
  'room:left': (roomId: string) => void;
  'room:updated': (room: Room) => void;
  'room:error': (error: string) => void;
  'game:state': (state: GameState) => void;
  'game:action': (playerSeat: number, action: ActionType, amount: number) => void;
  'game:phase': (phase: GamePhase, communityCards: Card[]) => void;
  'game:showdown': (data: {
    players: {
      playerSeat: number;
      playerName: string;
      status: string;
      chips: number;
      currentBet: number;
      hand: HandResult | null;
      cards: [Card, Card] | null;
      isWinner: boolean;
      winAmount: number;
    }[];
    communityCards: Card[];
  }) => void;
  'game:winner': (winners: { playerSeat: number; amount: number }[]) => void;
  'game:started': () => void;
  'game:ended': () => void;
  'player:timeout': (playerSeat: number) => void;
  // 新增：洗牌和发牌事件
  'game:shuffle': (duration: number) => void;  // 洗牌动画开始，duration为持续时间(ms)
  'game:deal': (playerSeat: number, cardIndex: number, card: Card) => void;  // 发单张牌
  'game:blind': (playerSeat: number, amount: number, blindType: 'sb' | 'bb') => void;  // 盲注下注
  // AI思考事件
  'game:ai-thinking': (data: { playerSeat: number; thinkTime: number }) => void;
  // 玩家手牌事件（只发送给对应玩家）
  'game:hole-cards': (holeCards: [Card, Card]) => void;
}

export interface ClientToServerEvents {
  'room:create': (playerName: string, cb: (room: Room) => void) => void;
  'room:join': (code: string, playerName: string, cb: (room: Room | null, error?: string) => void) => void;
  'room:leave': (roomId: string, cb: () => void) => void;
  'room:add-ai': (roomId: string, aiLevel: AILv, cb: (player: Player) => void) => void;
  'room:kick': (roomId: string, playerSeat: number, cb: () => void) => void;
  'room:start': (roomId: string, cb: (success: boolean, error?: string) => void) => void;
  'room:set-blind': (roomId: string, sb: number, bb: number, cb: () => void) => void;
  'game:action': (roomId: string, action: ActionType, cb: (success: boolean, error?: string) => void, amount?: number) => void;
}
