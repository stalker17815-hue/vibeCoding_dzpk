import { Player, Room, Card, ActionType, GamePhase, AILv } from '../types';
import { getRankValue } from '../game/Deck';
import { evaluateHand } from '../game/Evaluator';

interface AIAction {
  action: ActionType;
  amount?: number;
}

export class AIController {
  // 决策入口
  decide(player: Player, room: Room, phase: GamePhase, communityCards: Card[]): AIAction {
    switch (player.aiLevel) {
      case 1:
        return this.decideLv1(player, room, phase, communityCards);
      case 2:
        return this.decideLv2(player, room, phase, communityCards);
      case 3:
        return this.decideLv3(player, room, phase, communityCards);
      default:
        return { action: 'check' };
    }
  }

  // Lv1: 陪练型 - 主要过牌或跟注，很少弃牌
  private decideLv1(player: Player, room: Room, phase: GamePhase, communityCards: Card[]): AIAction {
    const actions: ActionType[] = ['check', 'call', 'raise'];  // 移除 fold
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;

    // 过滤不可用的行动
    let availableActions = actions.filter(a => {
      if (a === 'check' && !canCheck) return false;
      // 当不需要跟注时(callAmount=0)，不能选择 call，应该选择 check
      if (a === 'call' && (callAmount <= 0 || player.chips < callAmount)) return false;
      if (a === 'raise' && player.chips <= maxBet - player.currentBet + room.minRaise) return false;
      return true;
    });

    // 如果没有可用行动，选择 all-in
    if (availableActions.length === 0) {
      return player.chips > 0 ? { action: 'all_in' } : { action: 'check' };
    }

    // 优先选择 check（当不需要跟注时），避免 fold
    if (canCheck) {
      return { action: 'check' };
    }

    // 如果需要跟注，优先选择 call 或 raise，避免 fold
    const preferredActions = availableActions.filter(a => a === 'call' || a === 'raise');
    const useActions = preferredActions.length > 0 ? preferredActions : availableActions;

    const randomAction = useActions[Math.floor(Math.random() * useActions.length)];

    if (randomAction === 'raise') {
      // 计算正确的加注金额
      const minRequired = maxBet + room.minRaise - player.currentBet;
      // 随机加注金额：最小加注到 minRequired，最大到 all-in
      const maxRaise = player.chips;
      const raiseAmount = minRequired + Math.floor(Math.random() * Math.max(1, maxRaise - minRequired + 1));
      return { action: 'raise', amount: raiseAmount };
    }

    return { action: randomAction };
  }

  // Lv2: 概率型 - 根据手牌强度决策
  private decideLv2(player: Player, room: Room, phase: GamePhase, communityCards: Card[]): AIAction {
    if (!player.holeCards) return { action: 'check' };

    const handStrength = this.evaluateHandStrength(player.holeCards, communityCards, phase);
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;
    const potOdds = this.calculatePotOdds(callAmount, room.pot);

    // 如果不需要跟注(callAmount=0)，直接过牌
    if (callAmount <= 0) {
      return { action: 'check' };
    }

    // 强牌：raise或bet
    if (handStrength > 0.7) {
      if (player.chips > maxBet - player.currentBet + room.minRaise) {
        // 计算正确的加注金额，有随机性
        const minRequired = maxBet + room.minRaise - player.currentBet;
        const maxRaise = player.chips;
        const raiseAmount = minRequired + Math.floor(Math.random() * Math.max(1, maxRaise - minRequired + 1));
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    // 中等牌：根据赔率决策，尽量不弃牌
    if (handStrength > 0.4) {
      if (potOdds < handStrength) {
        return canCheck ? { action: 'check' } : { action: 'call' };
      }
      // 赔率不好但尽量不弃牌
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        return { action: 'call' };
      }
      return { action: 'all_in' };
    }

    // 弱牌：过牌或跟注，尽量不弃牌
    if (canCheck) {
      return { action: 'check' };
    }
    // 如果不能过牌但有筹码，选择跟注
    if (callAmount > 0 && player.chips >= callAmount) {
      return { action: 'call' };
    }
    // 只能 all-in
    return { action: 'all_in' };
  }

  // Lv3: 策略型 - 综合考虑位置、赔率、对手
  private decideLv3(player: Player, room: Room, phase: GamePhase, communityCards: Card[]): AIAction {
    if (!player.holeCards) return { action: 'check' };

    const handStrength = this.evaluateHandStrength(player.holeCards, communityCards, phase);
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;
    const potOdds = this.calculatePotOdds(callAmount, room.pot);

    // 如果不需要跟注(callAmount=0)，直接过牌
    if (callAmount <= 0) {
      return { action: 'check' };
    }

    // 位置因素：后位更有利
    const positionFactor = this.getPositionFactor(player, room);
    const adjustedStrength = handStrength * positionFactor;

    // 对手因素
    const opponentFactor = this.getOpponentFactor(player, room);

    // 综合决策
    if (adjustedStrength > 0.75 && opponentFactor > 0.5) {
      if (player.chips > maxBet - player.currentBet + room.minRaise) {
        const raiseAmount = this.calculateRaiseAmount(room, player);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    if (adjustedStrength > 0.5) {
      if (potOdds < adjustedStrength) {
        return canCheck ? { action: 'check' } : { action: 'call' };
      }
      // 尽量不弃牌
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        return { action: 'call' };
      }
      return { action: 'all_in' };
    }

    if (canCheck) {
      return { action: 'check' };
    }

    // 后面位置或赔率好可以跟注，否则尝试 all-in
    if (positionFactor > 1.2 || potOdds < adjustedStrength) {
      if (player.chips >= callAmount) {
        return { action: 'call' };
      }
    }

    // 尽量不弃牌，选择 all-in
    return player.chips > 0 ? { action: 'all_in' } : { action: 'check' };
  }

  // 评估手牌强度 (0-1)
  private evaluateHandStrength(holeCards: [Card, Card], communityCards: Card[], phase: GamePhase): number {
    const rank1 = getRankValue(holeCards[0].rank);
    const rank2 = getRankValue(holeCards[1].rank);
    const suited = holeCards[0].suit === holeCards[1].suit;
    const isPair = rank1 === rank2;
    const gap = Math.abs(rank1 - rank2);

    // 口袋对
    if (isPair) {
      if (rank1 >= 12) return 0.95; // AA, KK
      if (rank1 >= 10) return 0.85; // QQ, JJ
      if (rank1 >= 8) return 0.7;   // TT, 99
      return 0.5;
    }

    // 同花连张
    if (suited && gap <= 2 && Math.min(rank1, rank2) >= 6) {
      return 0.65;
    }

    // 同花间隔
    if (suited && gap <= 4) {
      return 0.45;
    }

    // 高牌
    if (Math.max(rank1, rank2) >= 12) {
      return 0.4;
    }

    // 公共牌配合
    if (communityCards.length > 0) {
      const allCards = [...holeCards, ...communityCards];
      const hand = evaluateHand(holeCards, communityCards);
      const typeStrength = this.getHandTypeStrength(hand.type);
      return Math.max(typeStrength, (rank1 + rank2) / 30);
    }

    return 0.25;
  }

  // 牌型强度
  private getHandTypeStrength(type: string): number {
    const strengths: Record<string, number> = {
      'royal_flush': 1.0,
      'straight_flush': 0.95,
      'four_of_a_kind': 0.9,
      'full_house': 0.85,
      'flush': 0.8,
      'straight': 0.75,
      'three_of_a_kind': 0.65,
      'two_pair': 0.5,
      'one_pair': 0.35,
      'high_card': 0.2
    };
    return strengths[type] || 0.2;
  }

  // 底池赔率
  private calculatePotOdds(callAmount: number, pot: number): number {
    if (callAmount <= 0) return 1;
    return callAmount / (pot + callAmount);
  }

  // 计算加注金额
  private calculateRaiseAmount(room: Room, player: Player): number {
    const maxBet = this.getMaxBet(room);
    const baseRaise = room.minRaise;
    const potSize = room.pot;

    // 最小需要加注到的金额
    const minRequired = maxBet + room.minRaise - player.currentBet;

    // 底池大小的50%-100%作为额外加注
    const potRaise = Math.floor(potSize * (0.5 + Math.random() * 0.5));

    // 总加注金额 = 最小需要 + 额外加注（有随机性）
    const maxRaise = player.chips;
    const raiseAmount = minRequired + potRaise;
    return Math.min(Math.max(raiseAmount, minRequired), maxRaise);
  }

  // 位置因素 - 已移除庄家概念，所有位置公平对待
  private getPositionFactor(player: Player, room: Room): number {
    // 庄家概念已移除，所有位置使用相同的因素
    return 1.0;
  }

  // 对手因素
  private getOpponentFactor(player: Player, room: Room): number {
    // 简化的对手分析
    const otherPlayers = room.players.filter(p => p.id !== player.id && p.status === 'active');
    if (otherPlayers.length === 0) return 1.0;

    // 根据玩家数量调整
    return otherPlayers.length <= 2 ? 1.1 : 0.9;
  }

  // 获取最大下注
  private getMaxBet(room: Room): number {
    return Math.max(...room.players.map(p => p.currentBet));
  }
}

export const aiController = new AIController();
