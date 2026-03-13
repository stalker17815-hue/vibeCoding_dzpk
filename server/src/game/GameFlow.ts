import { Room, Player, Card, ActionType, GamePhase, HandResult, AILv } from '../types';
import { createDeck, shuffleDeck, dealCards } from './Deck';
import { evaluateHand, compareHands } from './Evaluator';
import { roomManager } from '../room/RoomManager';
import { aiController } from '../ai/AIController';
import { writeGameLog, LOG_FILE } from '../utils/logger';

// 最大下注金额限制
const MAX_BET = 1000;

type GameEventCallback = (event: string, data: any) => void;
type SendToPlayerCallback = (playerId: string, event: string, data: any) => void;

// 玩家是否已在本轮下注轮中行动过
interface PlayerBetState {
  seatIndex: number;
  hasActed: boolean;
  hasRaised: boolean;
}

export class GameFlow {
  private room: Room;
  private onEvent: GameEventCallback;
  private actionTimer: NodeJS.Timeout | null = null;
  private readonly ACTION_TIMEOUT = 30000; // 30秒
  private lastAction: { playerSeat: number; action: ActionType; amount: number } | null = null;

  // 记录本轮下注轮中玩家的行动状态
  private playerBetStates: PlayerBetState[] = [];

  private sendToPlayer: SendToPlayerCallback | null = null;

  constructor(room: Room, onEvent: GameEventCallback, sendToPlayer?: SendToPlayerCallback) {
    this.room = room;
    this.onEvent = onEvent;
    this.sendToPlayer = sendToPlayer || null;
  }

  // 获取房间信息（公开给 socket handlers 使用）
  getRoom(): Room {
    return this.room;
  }

  // 获取最大下注（公开给 socket handlers 使用）
  getMaxBetValue(): number {
    return this.getMaxBet();
  }

  // 开始游戏（整个游戏session）
  start(): void {
    if (this.room.players.length < 2) {
      this.onEvent('game:error', { message: '至少需要2名玩家才能开始游戏' });
      return;
    }

    this.room.status = 'playing';
    this.room.deck = shuffleDeck(createDeck());
    writeGameLog(`Game start, setting pot=0 (previous pot was ${this.room.pot})`);
    this.room.pot = 0;
    this.room.sidePots = [];
    this.room.communityCards = [];
    this.room.currentPhase = 'preflop';

    // 重置玩家状态（保留已有筹码，只重置当前手牌的状态）
    for (const player of this.room.players) {
      player.holeCards = null;
      player.status = 'active';
      player.currentBet = 0;
      player.totalBet = 0;
    }

    // 随机选择起始玩家座位（庄家概念已移除）
    this.room.currentPlayerSeat = Math.floor(Math.random() * this.room.players.length);
    console.log('[GameFlow] Random starting player seat:', this.room.currentPlayerSeat);

    this.onEvent('game:started', {});
    this.startHand();
  }

  // 开始下一手牌（复用游戏实例）
  startNextHand(): void {
    if (this.room.players.length < 2) {
      this.onEvent('game:error', { message: '至少需要2名玩家才能开始游戏' });
      return;
    }

    // 检查房间状态
    if (this.room.status !== 'playing') {
      this.room.status = 'playing';
    }

    writeGameLog(`Starting next hand, pot was ${this.room.pot}, keeping chips`);

    // 清理桌面，但保留 pot 和玩家筹码
    this.room.deck = shuffleDeck(createDeck());
    this.room.sidePots = [];
    this.room.communityCards = [];
    this.room.currentPhase = 'preflop';

    // 重置玩家手牌状态（保留筹码）
    for (const player of this.room.players) {
      player.holeCards = null;
      player.status = 'active';
      player.currentBet = 0;
      player.totalBet = 0;
    }

    this.onEvent('game:started', {});
    this.startHand();
  }

  // 开始一手牌（异步流程）
  private async startHand(): Promise<void> {
    try {
      console.log('[GameFlow] startHand called');

      // 洗牌
      this.room.deck = shuffleDeck(createDeck());
      this.room.pot = 0;
      this.room.sidePots = [];
      this.room.communityCards = [];
      this.room.currentPhase = 'preflop';
      this.room.minRaise = this.room.bb;
      console.log('[GameFlow] Phase 1: init done');

      // 重置玩家
      for (const player of this.room.players) {
        player.holeCards = null;
        player.status = 'active';
        player.currentBet = 0;
      }
      console.log('[GameFlow] Phase 2: players reset');

      // 发送洗牌事件（动画5秒）
      this.onEvent('game:shuffle', { duration: 3000 });
      console.log('[GameFlow] Phase 3: shuffle event emitted');

      // 等待5秒洗牌动画完成
      await this.delay(5000);

      // 异步发底牌 - 从庄家位置开始发
      await this.dealHoleCardsAsync();
      writeGameLog(`Phase 4: hole cards dealt, starting player seat: ${this.room.currentPlayerSeat}`);
      console.log('[GameFlow] Phase 4: hole cards dealt');

      // 强制小盲和大盲下注
      this.postBlinds();

      // 初始化本轮行动状态
      this.initBetStates();

      // 随机选择起始玩家（已在上局游戏开始时设置，这里保持不变）
      writeGameLog(`Phase 5: preflop betting round starting, first player seat: ${this.room.currentPlayerSeat}`);

      this.onEvent('game:phase', { phase: 'preflop', communityCards: [] });
      console.log('[GameFlow] Phase 7: game:phase emitted');
      this.notifyGameState();
      console.log('[GameFlow] Phase 8: game:state emitted');

      // 检查当前玩家是否是 AI
      const currentPlayer = this.getPlayerBySeat(this.room.currentPlayerSeat);
      console.log('[GameFlow] Phase 9: currentPlayer:', currentPlayer?.name, 'type:', currentPlayer?.type);
      if (currentPlayer && currentPlayer.type === 'ai') {
        console.log('[GameFlow] Current player is AI, processing action');
        this.processAIAction(currentPlayer).then(() => {
          console.log('[GameFlow] AI action completed');
        }).catch(err => {
          console.error('[GameFlow] AI action error:', err);
        });
      } else {
        console.log('[GameFlow] Scheduling timeout for human player');
        this.scheduleNextAction();
      }
      console.log('[GameFlow] Phase 9: scheduleNextAction done');
    } catch (err) {
      console.error('[GameFlow] Error in startHand:', err);
    }
  }

  // 发底牌 - 从庄家位置开始，依次发一圈，再发一圈
  private dealHoleCards(): void {
    const playerCount = this.room.players.length;
    const startSeat = this.room.currentPlayerSeat;

    // 临时存储每张牌
    const playerCards: Map<number, [Card, Card]> = new Map();

    // 第一轮发牌：从起始玩家开始，每人1张
    for (let i = 0; i < playerCount; i++) {
      const seat = (startSeat + i) % playerCount;
      const player = this.getPlayerBySeat(seat);
      if (player) {
        const card = dealCards(this.room.deck, 1)[0];
        const existing = playerCards.get(player.seatIndex) || [null as unknown as Card, null as unknown as Card];
        existing[0] = card;
        playerCards.set(player.seatIndex, existing);
      }
    }

    // 第二轮发牌：从起始玩家开始，每人1张
    for (let i = 0; i < playerCount; i++) {
      const seat = (startSeat + i) % playerCount;
      const player = this.getPlayerBySeat(seat);
      if (player) {
        const card = dealCards(this.room.deck, 1)[0];
        const existing = playerCards.get(player.seatIndex) || [null as unknown as Card, null as unknown as Card];
        existing[1] = card;
        playerCards.set(player.seatIndex, existing);
      }
    }

    // 分配给玩家
    for (const player of this.room.players) {
      const cards = playerCards.get(player.seatIndex);
      if (cards) {
        player.holeCards = cards as [Card, Card];
      }
    }
  }

  // 初始化本轮下注轮中玩家的行动状态
  private initBetStates(): void {
    this.playerBetStates = this.room.players.map(p => ({
      seatIndex: p.seatIndex,
      hasActed: false,
      hasRaised: false
    }));

    // 初始化完成后无需特殊处理，所有玩家都未行动
  }

  // 根据数组索引获取座位号
  private getSeatByArrayIndex(index: number): number {
    const player = this.room.players[index];
    return player ? player.seatIndex : index;
  }

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 异步发底牌 - 带动画事件
  private async dealHoleCardsAsync(): Promise<void> {
    const playerCount = this.room.players.length;
    const startSeat = this.room.currentPlayerSeat;

    // 每张牌间隔时间 (ms)
    const cardDelay = 300;

    // 临时存储每张牌
    const playerCards: Map<number, [Card | null, Card | null]> = new Map();

    // 初始化玩家手牌
    for (const player of this.room.players) {
      playerCards.set(player.seatIndex, [null, null]);
    }

    // 第一轮发牌：从起始玩家开始，每人1张
    for (let i = 0; i < playerCount; i++) {
      const seat = (startSeat + i) % playerCount;
      const player = this.getPlayerBySeat(seat);
      if (player && this.room.deck.length > 0) {
        const card = this.room.deck.pop()!;
        const cards = playerCards.get(player.seatIndex)!;
        cards[0] = card;

        // 发送发牌事件
        this.onEvent('game:deal', {
          playerSeat: player.seatIndex,
          cardIndex: 0,
          card: card
        });

        // 延迟后再发下一张
        if (i < playerCount - 1) {
          await this.delay(cardDelay);
        }
      }
    }

    // 第二轮发牌：从起始玩家开始，每人1张
    for (let i = 0; i < playerCount; i++) {
      const seat = (startSeat + i) % playerCount;
      const player = this.getPlayerBySeat(seat);
      if (player && this.room.deck.length > 0) {
        const card = this.room.deck.pop()!;
        const cards = playerCards.get(player.seatIndex)!;
        cards[1] = card;

        // 发送发牌事件
        this.onEvent('game:deal', {
          playerSeat: player.seatIndex,
          cardIndex: 1,
          card: card
        });

        // 延迟后再发下一张
        if (i < playerCount - 1) {
          await this.delay(cardDelay);
        }
      }
    }

    // 立即更新玩家手牌信息（用于服务端计算）
    for (const player of this.room.players) {
      const cards = playerCards.get(player.seatIndex);
      if (cards && cards[0] && cards[1]) {
        player.holeCards = [cards[0], cards[1]];
      }
    }

    console.log('[GameFlow] Hole cards dealt and stored on server');

    // 发送手牌给每个玩家
    this.distributeHoleCardsToPlayers();
  }

  // 发送手牌给每个玩家（仅发送给玩家自己）
  private distributeHoleCardsToPlayers(): void {
    if (!this.sendToPlayer) {
      console.log('[GameFlow] sendToPlayer not available, skipping hole card distribution');
      return;
    }

    for (const player of this.room.players) {
      if (player.holeCards) {
        console.log(`[GameFlow] Sending hole cards to player ${player.name} (${player.id})`);
        this.sendToPlayer(player.id, 'game:hole-cards', player.holeCards);
      }
    }
  }

  // 强制小盲和大盲下注
  private postBlinds(): void {
    const players = this.room.players;
    const playerCount = players.length;

    if (playerCount < 2) return;

    // 庄家位置（按钮位）是 currentPlayerSeat
    const dealerSeat = this.room.currentPlayerSeat;
    const dealerIndex = players.findIndex(p => p.seatIndex === dealerSeat);

    // 小盲位：庄家左手边（逆时针方向的下一个）
    const sbIndex = (dealerIndex - 1 + playerCount) % playerCount;
    const sbPlayer = players[sbIndex];

    // 大盲位：小盲左手边（逆时针方向的下一个）
    const bbIndex = (dealerIndex - 2 + playerCount) % playerCount;
    const bbPlayer = players[bbIndex];

    const sbAmount = this.room.sb;
    const bbAmount = this.room.bb;

    // 小盲下注
    if (sbPlayer.chips >= sbAmount) {
      sbPlayer.chips -= sbAmount;
      sbPlayer.currentBet += sbAmount;
      this.onEvent('game:blind', {
        playerSeat: sbPlayer.seatIndex,
        amount: sbAmount,
        blindType: 'sb'
      });
      writeGameLog(`Small blind: ${sbPlayer.name} posts ${sbAmount}`);
    } else if (sbPlayer.chips > 0) {
      // 筹码不足小盲，全下
      const allIn = sbPlayer.chips;
      sbPlayer.chips = 0;
      sbPlayer.currentBet += allIn;
      sbPlayer.status = 'all_in';
      this.onEvent('game:blind', {
        playerSeat: sbPlayer.seatIndex,
        amount: allIn,
        blindType: 'sb'
      });
      writeGameLog(`Small blind: ${sbPlayer.name} all-in ${allIn}`);
    }

    // 大盲下注
    if (bbPlayer.chips >= bbAmount) {
      bbPlayer.chips -= bbAmount;
      bbPlayer.currentBet += bbAmount;
      this.onEvent('game:blind', {
        playerSeat: bbPlayer.seatIndex,
        amount: bbAmount,
        blindType: 'bb'
      });
      writeGameLog(`Big blind: ${bbPlayer.name} posts ${bbAmount}`);
    } else if (bbPlayer.chips > 0) {
      // 筹码不足大盲，全下
      const allIn = bbPlayer.chips;
      bbPlayer.chips = 0;
      bbPlayer.currentBet += allIn;
      bbPlayer.status = 'all_in';
      this.onEvent('game:blind', {
        playerSeat: bbPlayer.seatIndex,
        amount: allIn,
        blindType: 'bb'
      });
      writeGameLog(`Big blind: ${bbPlayer.name} all-in ${allIn}`);
    }

    // 更新底池
    this.updatePot();
  }

  // 玩家行动
  playerAction(playerId: string, action: ActionType, amount?: number): boolean {
    writeGameLog(`playerAction called: playerId=${playerId}, action=${action}, amount=${amount}`);

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) {
      writeGameLog(`playerAction: player not found`);
      return false;
    }

    const playerSeatIndex = this.room.players.indexOf(player);
    writeGameLog(`playerAction: player seatIndex=${playerSeatIndex}, currentPlayerSeat=${this.room.currentPlayerSeat}`);

    if (playerSeatIndex !== this.room.currentPlayerSeat) {
      writeGameLog(`playerAction: NOT CURRENT PLAYER, returning false`);
      return false;
    }

    // 清除计时器
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }

    const success = this.processAction(player, action, amount);
    if (success) {
      // 标记该玩家已行动
      const betState = this.playerBetStates.find(s => s.seatIndex === player.seatIndex);
      if (betState) {
        betState.hasActed = true;
        if (action === 'raise') {
          betState.hasRaised = true;
          // 加注后，其他玩家的 hasRaised 变为 false（需要重新跟注）
          // 同时重置 hasActed，确保所有玩家都需要重新行动
          for (const state of this.playerBetStates) {
            if (state.seatIndex !== player.seatIndex) {
              state.hasRaised = false;
              // 只有活跃玩家需要重新行动
              if (this.isPlayerActive(state.seatIndex)) {
                state.hasActed = false;
              }
            }
          }
        }
      }

      this.onEvent('game:action', {
        playerSeat: player.seatIndex,
        action,
        amount: amount || 0
      });
      this.lastAction = { playerSeat: player.seatIndex, action, amount: amount || 0 };
      writeGameLog(`playerAction: calling nextTurn()`);
      this.nextTurn();
    } else {
      // 行动失败，重新发送当前游戏状态，让玩家重新选择
      writeGameLog(`playerAction: action failed, re-notifying game state`);
      this.notifyGameState();
    }

    return success;
  }

  // 处理行动
  private processAction(player: Player, action: ActionType, amount?: number): boolean {
    const maxBet = this.getMaxBet();
    writeGameLog(`processAction: action=${action}, amount=${amount}, player=${player.name}, chips=${player.chips}, currentBet=${player.currentBet}, maxBet=${maxBet}, minRaise=${this.room.minRaise}`);

    switch (action) {
      case 'fold':
        player.status = 'folded';
        break;

      case 'check':
        if (player.currentBet < maxBet) {
          writeGameLog(`processAction: check failed - player.currentBet ${player.currentBet} < maxBet ${maxBet}`);
          return false;
        }
        break;

      case 'call':
        const callAmount = maxBet - player.currentBet;
        // 如果不需要跟注（有人过牌等情况），则不能执行 call，应该提示玩家执行 check
        if (callAmount <= 0) {
          writeGameLog(`processAction: call failed - no need to call (callAmount=${callAmount}), player should check instead`);
          return false;
        }
        if (callAmount > player.chips) {
          writeGameLog(`processAction: call failed - callAmount ${callAmount} > chips ${player.chips}`);
          return false;
        }
        player.chips -= callAmount;
        player.currentBet += callAmount;
        break;

      case 'raise':
        if (!amount || amount <= 0) {
          writeGameLog(`processAction: raise failed - invalid amount ${amount}`);
          return false;
        }
        // 限制最大加注金额为 MAX_BET = 1000
        if (amount > MAX_BET) {
          writeGameLog(`processAction: raise failed - amount ${amount} exceeds max bet ${MAX_BET}`);
          return false;
        }
        // amount 是额外加注额（无论当前是否需要跟注）
        // 总下注 = 当前下注 + 额外加注额
        const totalBet = player.currentBet + amount;
        // 最低需要加注到 maxBet + minRaise
        if (totalBet < maxBet + this.room.minRaise) {
          writeGameLog(`processAction: raise failed - totalBet ${totalBet} < maxBet ${maxBet} + minRaise ${this.room.minRaise}`);
          return false;
        }
        const betAmount = amount; // 额外加注额就是实际要投入的筹码
        if (betAmount > player.chips) {
          writeGameLog(`processAction: raise failed - betAmount ${betAmount} > chips ${player.chips}`);
          return false;
        }
        player.chips -= betAmount;
        player.currentBet = totalBet;
        this.room.minRaise = Math.min(betAmount, this.room.minRaise);
        break;

      case 'all_in':
        const allInAmount = player.chips;
        player.chips = 0;
        player.currentBet += allInAmount;
        player.status = 'all_in';
        if (player.currentBet > maxBet + this.room.minRaise) {
          this.room.minRaise = player.currentBet - maxBet;
        }
        break;
    }

    this.updatePot();
    writeGameLog(`processAction: ${action} successful for player ${player.name}`);
    return true;
  }

  // 下一回合
  private nextTurn(): void {
    writeGameLog(`nextTurn called, currentPlayerSeat: ${this.room.currentPlayerSeat}`);

    // 调试：打印当前行动状态
    const betStates = this.playerBetStates.map(s => `seat${s.seatIndex}(acted=${s.hasActed},raised=${s.hasRaised})`).join(', ');
    writeGameLog(`Bet states: ${betStates}`);

    // 检查是否所有玩家都已行动
    if (this.isBettingRoundComplete()) {
      writeGameLog('Betting round complete, ending round');
      this.endBettingRound();
      return;
    }

    // 找下一个活跃玩家
    const nextSeat = this.getNextActiveSeat(this.room.currentPlayerSeat);
    writeGameLog(`Next seat: ${nextSeat}`);

    // 检查是否已经绕了一圈回到起点（所有玩家都行动过了）
    // 如果回到起点且所有玩家下注相等，则结束下注轮
    if (this.hasCompletedFullRound()) {
      writeGameLog('Completed full round, ending');
      this.endBettingRound();
      return;
    }

    this.room.currentPlayerSeat = nextSeat;
    writeGameLog(`Setting currentPlayerSeat to: ${nextSeat}`);

    // 先发送当前状态
    this.notifyGameState();

    // 检查当前玩家是否是AI
    const currentPlayer = this.getPlayerBySeat(this.room.currentPlayerSeat);
    writeGameLog(`Current player: ${currentPlayer?.name}, type: ${currentPlayer?.type}`);
    if (currentPlayer && currentPlayer.type === 'ai') {
      this.processAIAction(currentPlayer);
    } else {
      this.scheduleNextAction();
    }
  }

  // 检查是否已经完成了一轮（回到了起点位置）
  private hasCompletedFullRound(): boolean {
    // 找出本轮第一个行动的玩家（枪口位或小盲位，取决于阶段）
    const firstPlayerSeat = this.getFirstPlayerSeat();

    // 如果当前玩家已经行动完一圈回到了第一个玩家
    // 检查是否所有活跃玩家都已行动且下注相等
    const activePlayers = this.room.players.filter(p => this.isPlayerActive(p.seatIndex));
    const maxBet = this.getMaxBet();

    // 所有活跃玩家都已行动
    const allActed = activePlayers.every(p => {
      const state = this.playerBetStates.find(s => s.seatIndex === p.seatIndex);
      return state?.hasActed;
    });

    // 所有活跃玩家下注相等
    const allBetsEqual = activePlayers.every(p => p.currentBet === maxBet);

    return allActed && allBetsEqual;
  }

  // 获取本轮第一个行动的玩家座位（已移除盲注，保持当前玩家）
  private getFirstPlayerSeat(): number {
    // 每个下注轮从当前玩家开始
    return this.room.currentPlayerSeat;
  }

  // 检查下注轮是否完成
  private isBettingRoundComplete(): boolean {
    const activePlayers = this.room.players.filter(p => this.isPlayerActive(p.seatIndex));

    // 只有一个玩家，直接获胜
    if (activePlayers.length <= 1) return true;

    const maxBet = this.getMaxBet();

    // 所有活跃玩家下注相同
    const allBetsEqual = activePlayers.every(p => p.currentBet === maxBet);

    // 所有活跃玩家都已行动
    const allActed = activePlayers.every(p => {
      const state = this.playerBetStates.find(s => s.seatIndex === p.seatIndex);
      return state?.hasActed;
    });

    return allBetsEqual && allActed;
  }

  // 玩家是否活跃
  private isPlayerActive(seatIndex: number): boolean {
    const player = this.getPlayerBySeat(seatIndex);
    return !!player && (player.status === 'active' || player.status === 'all_in');
  }

  // 获取最大下注
  private getMaxBet(): number {
    return Math.max(...this.room.players.map(p => p.currentBet));
  }

  // 更新底池（总下注 + 当前轮下注）
  private updatePot(): void {
    const totalBets = this.room.players.reduce((sum, p) => sum + p.totalBet + p.currentBet, 0);
    this.room.pot = totalBets;
  }

  // 结束下注轮
  private endBettingRound(): void {
    // 清除上一轮的行动记录
    this.lastAction = null;

    // 检查是否只有一名玩家还没弃牌
    const activePlayers = this.room.players.filter(p => p.status === 'active' || p.status === 'all_in');
    if (activePlayers.length === 1) {
      writeGameLog(`Only one player remaining: ${activePlayers[0].name}, awarding pot`);
      // 只有一名玩家，直接获胜
      const winner = activePlayers[0];
      const potAmount = this.room.pot;
      winner.chips += potAmount;
      this.room.pot = 0;
      this.onEvent('game:winner', [{
        playerSeat: winner.seatIndex,
        amount: potAmount
      }]);
      this.endHand();
      return;
    }

    switch (this.room.currentPhase) {
      case 'preflop':
        writeGameLog(`Phase transition: preflop -> flop, dealing 3 community cards`);
        this.room.currentPhase = 'flop';
        this.dealCommunityCards(3);
        break;
      case 'flop':
        writeGameLog(`Phase transition: flop -> turn, dealing 1 community card`);
        this.room.currentPhase = 'turn';
        this.dealCommunityCards(1);
        break;
      case 'turn':
        writeGameLog(`Phase transition: turn -> river, dealing 1 community card`);
        this.room.currentPhase = 'river';
        this.dealCommunityCards(1);
        break;
      case 'river':
        writeGameLog(`Phase transition: river -> showdown`);
        this.room.currentPhase = 'showdown';
        this.showdown();
        return;
    }

    // 将当前轮下注累加到总下注，并重置当前轮下注
    for (const player of this.room.players) {
      player.totalBet += player.currentBet;
      player.currentBet = 0;
    }

    // 重置本轮行动状态
    this.initBetStates();
    writeGameLog(`endBettingRound: players: ${this.room.players.map(p => `seat${p.seatIndex}(${p.name})`).join(', ')}`);

    // 保持当前玩家（不再需要根据盲注位置设置）
    this.room.currentPlayerSeat = this.getNextActiveSeat(this.room.currentPlayerSeat);

    this.onEvent('game:phase', {
      phase: this.room.currentPhase,
      communityCards: this.room.communityCards
    });
    console.log('[GameFlow] game:phase emitted:', this.room.currentPhase, 'communityCards:', JSON.stringify(this.room.communityCards));

    // AI行动
    const currentPlayer = this.getPlayerBySeat(this.room.currentPlayerSeat);
    if (currentPlayer && currentPlayer.type === 'ai') {
      this.processAIAction(currentPlayer);
    } else {
      this.scheduleNextAction();
    }

    this.notifyGameState();
  }

  // 发公共牌
  private dealCommunityCards(count: number): void {
    const cards = dealCards(this.room.deck, count);
    this.room.communityCards.push(...cards);
  }

  // 摊牌
  private showdown(): void {
    writeGameLog(`Showdown! Community cards: ${JSON.stringify(this.room.communityCards)}`);
    const activePlayers = this.room.players.filter(p =>
      p.status === 'active' || p.status === 'all_in'
    );
    writeGameLog(`Showdown! Active players count: ${activePlayers.length}, players: ${activePlayers.map(p => `${p.name}(seat${p.seatIndex},status${p.status})`).join(', ')}`);

    if (activePlayers.length === 0) {
      // 所有玩家都弃牌，最后一个未弃牌的获胜
      const lastActive = this.room.players.find(p => p.status !== 'folded');
      if (lastActive) {
        lastActive.chips += this.room.pot;
        this.onEvent('game:winner', [{
          playerSeat: lastActive.seatIndex,
          amount: this.room.pot
        }]);
      }
      this.endHand();
      return;
    }

    // 评估所有玩家手牌
    const results = activePlayers.map(player => {
      const hand = evaluateHand(player.holeCards!, this.room.communityCards);
      return {
        player,
        hand
      };
    });

    // 排序找出最大牌型
    results.sort((a, b) => compareHands(b.hand, a.hand));

    // 分发底池
    const winners: { playerSeat: number, amount: number }[] = [];
    let remainingPot = this.room.pot;

    // 简单的底池分配（实际需要处理边池）
    const bestHand = results[0].hand;
    const winnersList = results.filter(r => compareHands(r.hand, bestHand) === 0);

    const winAmount = Math.floor(remainingPot / winnersList.length);
    for (const winner of winnersList) {
      winner.player.chips += winAmount;
      winners.push({ playerSeat: winner.player.seatIndex, amount: winAmount });
      remainingPot -= winAmount;
    }

    // 发送摊牌结果 - 包含所有玩家的详细信息
    const showdownResults = this.room.players.map(p => {
      const result = results.find(r => r.player.seatIndex === p.seatIndex);
      const isWinner = winners.some(w => w.playerSeat === p.seatIndex);
      const winAmount = isWinner ? winners.find(w => w.playerSeat === p.seatIndex)?.amount || 0 : 0;
      const totalBet = p.totalBet + p.currentBet;
      const profit = winAmount - totalBet;
      writeGameLog(`Showdown player: ${p.name}, status: ${p.status}, totalBet: ${totalBet}, winAmount: ${winAmount}, profit: ${profit}, chips: ${p.chips}`);
      return {
        playerSeat: p.seatIndex,
        playerName: p.name,
        status: p.status,
        chips: p.chips,
        currentBet: totalBet,
        hand: result ? result.hand : null,
        cards: p.holeCards,
        isWinner: isWinner,
        winAmount: winAmount
      };
    });

    writeGameLog(`Showdown! Sending game:showdown with all players info, total pot: ${this.room.pot}`);
    this.onEvent('game:showdown', { players: showdownResults, communityCards: this.room.communityCards });
    this.onEvent('game:winner', winners);

    // 检查是否需要结束游戏
    this.endHand();
  }

  // 结束一手牌 - 等待房主手动开始下一局
  private endHand(): void {
    writeGameLog(`Hand ended, waiting for host to start next hand`);

    // 移除破产玩家（筹码为0的玩家）
    const playersWithChips = this.room.players.filter(p => p.chips > 0);
    const bankruptPlayers = this.room.players.filter(p => p.chips <= 0);

    if (bankruptPlayers.length > 0) {
      for (const player of bankruptPlayers) {
        writeGameLog(`Player ${player.name} is bankrupt and removed from room`);
      }
      // 只保留有筹码的玩家
      this.room.players = playersWithChips;
    }

    // 检查剩余玩家数量
    if (this.room.players.length < 2) {
      // 游戏结束
      writeGameLog(`Game over, only ${this.room.players.length} player(s) left`);
      this.room.status = 'ended';
      this.onEvent('game:ended', {});
      return;
    }

    // 不再自动开始下一手，等待房主点击开始
    // 注意：当前游戏状态仍为 'playing'，房主可以点击开始下一局
  }

  // 玩家超时
  handleTimeout(): void {
    const player = this.getPlayerBySeat(this.room.currentPlayerSeat);
    if (player) {
      if (player.type === 'human') {
        // 真人超时，判定弃牌
        player.status = 'folded';
        this.onEvent('player:timeout', { playerSeat: player.seatIndex });
        this.nextTurn();
      }
    }
  }

  // 处理AI行动
  private async processAIAction(player: Player): Promise<void> {
    const action = aiController.decide(
      player,
      this.room,
      this.room.currentPhase,
      this.room.communityCards
    );

    // 根据AI级别设置思考时间
    const thinkTime = this.getAIThinkTime(player.aiLevel);
    console.log(`[GameFlow] AI ${player.name} (Lv${player.aiLevel}) thinking for ${thinkTime}ms...`);

    // 发送AI正在思考的事件
    this.onEvent('game:ai-thinking', {
      playerSeat: player.seatIndex,
      thinkTime: thinkTime
    });

    await new Promise(resolve => setTimeout(resolve, thinkTime));

    // 标记该玩家已行动
    const betState = this.playerBetStates.find(s => s.seatIndex === player.seatIndex);
    if (betState) {
      betState.hasActed = true;
      if (action.action === 'raise') {
        betState.hasRaised = true;
        // 加注后，其他玩家的 hasRaised 变为 false，同时重置 hasActed
        for (const state of this.playerBetStates) {
          if (state.seatIndex !== player.seatIndex) {
            state.hasRaised = false;
            // 只有活跃玩家需要重新行动
            if (this.isPlayerActive(state.seatIndex)) {
              state.hasActed = false;
            }
          }
        }
      }
    }

    const success = this.processAction(player, action.action, action.amount);
    if (success) {
      this.onEvent('game:action', {
        playerSeat: player.seatIndex,
        action: action.action,
        amount: action.amount || 0
      });
      this.lastAction = { playerSeat: player.seatIndex, action: action.action, amount: action.amount || 0 };
      this.nextTurn();
    } else {
      // AI 行动失败，重新通知游戏状态，让 AI 重新决策
      this.notifyGameState();
      // 短暂延迟后让 AI 重新行动
      setTimeout(() => {
        this.processAIAction(player);
      }, 1000);
    }
  }

  // AI思考时间：根据AI等级，Lv1最快(2s)，Lv2中等(2-6s)，Lv3最慢(4-10s)
  private getAIThinkTime(aiLevel?: AILv): number {
    switch (aiLevel) {
      case 1: // Lv1: 2秒固定
        return 2000;
      case 2: // Lv2: 2-6秒随机
        return 2000 + Math.floor(Math.random() * 4000);
      case 3: // Lv3: 4-10秒随机
        return 4000 + Math.floor(Math.random() * 6000);
      default:
        return 3000;
    }
  }

  // 调度下一个行动
  private scheduleNextAction(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
    }

    this.actionTimer = setTimeout(() => {
      this.handleTimeout();
    }, this.ACTION_TIMEOUT);
  }

  // 通知游戏状态
  private notifyGameState(): void {
    console.log('[GameFlow] notifyGameState called, lastAction:', this.lastAction);
    this.onEvent('game:state', {
      roomId: this.room.id,
      phase: this.room.currentPhase,
      pot: this.room.pot,
      sidePots: this.room.sidePots,
      communityCards: this.room.communityCards,
      currentPlayerSeat: this.room.currentPlayerSeat,
      players: this.room.players.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        aiLevel: p.aiLevel,
        chips: p.chips,
        status: p.status,
        currentBet: p.totalBet + p.currentBet,
        isHost: p.isHost,
        seatIndex: p.seatIndex,
        holeCards: null
      })),
      // buttonSeat 已移除
      lastAction: this.lastAction,
      lastBet: this.getMaxBet(),
      minRaise: this.room.minRaise
    });
  }

  // 获取座位的玩家
  private getPlayerBySeat(seatIndex: number): Player | undefined {
    return this.room.players.find(p => p.seatIndex === seatIndex);
  }

  // 获取下一个活跃玩家座位（从startSeat的下一个位置开始查找）
  private getNextActiveSeat(startSeat: number): number {
    const players = this.room.players;
    const playerCount = players.length;

    // 找到当前玩家在数组中的索引
    const currentIndex = players.findIndex(p => p.seatIndex === startSeat);
    if (currentIndex === -1) {
      // 如果找不到，从数组第一个开始
      const firstActive = players.find(p => this.isPlayerActive(p.seatIndex));
      return firstActive?.seatIndex ?? startSeat;
    }

    // 从下一个索引开始查找
    for (let i = 1; i <= playerCount; i++) {
      const nextIndex = (currentIndex + i) % playerCount;
      if (this.isPlayerActive(players[nextIndex].seatIndex)) {
        return players[nextIndex].seatIndex;
      }
    }
    return startSeat;
  }

  // 获取当前游戏状态
  getGameState() {
    return {
      roomId: this.room.id,
      phase: this.room.currentPhase,
      pot: this.room.pot,
      sidePots: this.room.sidePots,
      communityCards: this.room.communityCards,
      currentPlayerSeat: this.room.currentPlayerSeat,
      // buttonSeat 已移除
      minRaise: this.room.minRaise
    };
  }

  // 清理
  destroy(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }
}
