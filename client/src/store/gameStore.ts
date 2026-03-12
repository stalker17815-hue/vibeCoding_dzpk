import { create } from 'zustand';

// 类型定义
export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

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
  rank: number;
  kickers: number[];
  handCards?: Card[];
}

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';
export type GamePhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'disconnected';
export type PlayerType = 'human' | 'ai';
export type AILv = 1 | 2 | 3;

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  aiLevel?: AILv;
  chips: number;
  holeCards: [Card, Card] | null;
  status: PlayerStatus;
  currentBet: number;
  totalBet?: number;  // 本手牌总下注
  isHost: boolean;
  seatIndex: number;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  sb: number;
  bb: number;
  status: 'waiting' | 'playing' | 'ended';
  // buttonSeat 已移除
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
  lastBet: number;
  minRaise: number;
  lastAction: { playerSeat: number; action: ActionType; amount: number } | null;
}

interface GameStore {
  // 房间状态
  room: Room | null;
  playerId: string | null;

  // 游戏状态
  gameState: GameState | null;
  myCards: [Card, Card] | null;

  // UI状态
  isLoading: boolean;
  error: string | null;
  phaseName: string;

  // 摊牌结果
  showdownResults: {
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
  } | null;
  winners: { playerSeat: number; amount: number }[] | null;

  // 动画状态
  isShuffling: boolean;       // 是否正在洗牌
  dealingHoleCards: boolean;   // 是否正在发底牌
  recentDeal: { playerSeat: number; cardIndex: number; card: Card } | null;  // 最近一次发牌
  recentBlind: { playerSeat: number; amount: number; blindType: 'sb' | 'bb' } | null;  // 最近一次盲注

  // 游戏日志
  gameLogs: { id: number; timestamp: number; message: string; type: 'action' | 'system' | 'game'; playerSeat?: number }[];
  aiThinking: { playerSeat: number; thinkTime: number } | null;

  // 玩家统计
  profitHistory: { round: number; players: { name: string; profit: number; handType?: string }[] }[];  // 每轮盈亏历史

  // Actions
  setRoom: (room: Room | null) => void;
  setPlayerId: (id: string | null) => void;
  setGameState: (state: GameState | null) => void;
  setMyCards: (cards: [Card, Card] | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setShowdownResults: (results: GameStore['showdownResults']) => void;
  setWinners: (winners: { playerSeat: number; amount: number }[] | null) => void;
  setShuffling: (shuffling: boolean) => void;
  setDealingHoleCards: (dealing: boolean) => void;
  setRecentDeal: (deal: { playerSeat: number; cardIndex: number; card: Card } | null) => void;
  setRecentBlind: (blind: { playerSeat: number; amount: number; blindType: 'sb' | 'bb' } | null) => void;
  addGameLog: (message: string, type: 'action' | 'system' | 'game', playerSeat?: number) => void;
  setAIThinking: (thinking: { playerSeat: number; thinkTime: number } | null) => void;
  clearGameLogs: () => void;
  addProfitRecord: (players: { name: string; profit: number; handType?: string }[]) => void;
  reset: () => void;
}

const phaseNames: Record<GamePhase, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

let logIdCounter = 0;

export const useGameStore = create<GameStore>((set) => ({
  room: null,
  playerId: null,
  gameState: null,
  myCards: null,
  isLoading: false,
  error: null,
  phaseName: '等待中',
  showdownResults: null,
  winners: null,
  isShuffling: false,
  dealingHoleCards: false,
  recentDeal: null,
  recentBlind: null,
  gameLogs: [],
  aiThinking: null,
  profitHistory: [],

  setRoom: (room) => set({ room, phaseName: room?.status === 'playing' ? '游戏中' : '等待中' }),
  setPlayerId: (id) => set({ playerId: id }),
  setGameState: (state) => set({
    gameState: state,
    phaseName: state ? phaseNames[state.phase] : '等待中'
  }),
  setMyCards: (cards) => set({ myCards: cards }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setShowdownResults: (results: GameStore['showdownResults']) => set({ showdownResults: results }),
  setWinners: (winners) => set({ winners }),
  setShuffling: (shuffling) => set({ isShuffling: shuffling }),
  setDealingHoleCards: (dealing) => set({ dealingHoleCards: dealing }),
  setRecentDeal: (deal) => set({ recentDeal: deal }),
  setRecentBlind: (blind) => set({ recentBlind: blind }),
  addGameLog: (message, type, playerSeat) => set((state) => ({
    gameLogs: [...state.gameLogs, {
      id: ++logIdCounter,
      timestamp: Date.now(),
      message,
      type,
      playerSeat
    }].slice(-100) // 保留最近100条
  })),
  setAIThinking: (thinking) => set({ aiThinking: thinking }),
  clearGameLogs: () => set({ gameLogs: [] }),
  addProfitRecord: (players: { name: string; profit: number; handType?: string }[]) => set((state) => ({
    profitHistory: [...state.profitHistory, {
      round: state.profitHistory.length + 1,
      players
    }]
  })),
  reset: () => set({
    room: null,
    playerId: null,
    gameState: null,
    myCards: null,
    isLoading: false,
    error: null,
    phaseName: '等待中',
    showdownResults: null,
    winners: null,
    isShuffling: false,
    dealingHoleCards: false,
    recentDeal: null,
    recentBlind: null,
    gameLogs: [],
    aiThinking: null,
    profitHistory: [],
  }),
}));
