import { Player, Room, Card, ActionType, GamePhase, AILv } from '../types';
import { getRankValue } from '../game/Deck';
import { evaluateHand } from '../game/Evaluator';

interface AIAction {
  action: ActionType;
  amount?: number;
}

// 最大加注金额限制
const MAX_BET = 1000;

// 记录每局游戏中每个玩家的行为倾向种子
const gamePlayerSeeds = new Map<string, number>();

export class AIController {
  // 决策入口
  decide(player: Player, room: Room, phase: GamePhase, communityCards: Card[]): AIAction {
    // 为每个玩家生成唯一的随机种子（基于玩家ID和房间ID）
    const seedKey = `${room.id}-${player.id}`;
    if (!gamePlayerSeeds.has(seedKey)) {
      // 使用简单的哈希生成种子
      let hash = 0;
      for (let i = 0; i < seedKey.length; i++) {
        hash = ((hash << 5) - hash) + seedKey.charCodeAt(i);
        hash = hash & hash;
      }
      gamePlayerSeeds.set(seedKey, Math.abs(hash));
    }
    const playerSeed = gamePlayerSeeds.get(seedKey)!;

    switch (player.aiLevel) {
      case 1:
        return this.decideLv1(player, room, phase, communityCards, playerSeed);
      case 2:
        return this.decideLv2(player, room, phase, communityCards, playerSeed);
      case 3:
        return this.decideLv3(player, room, phase, communityCards, playerSeed);
      default:
        return { action: 'check' };
    }
  }

  // 使用种子生成伪随机数
  private seededRandom(seed: number): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  // Lv1: 陪练型 - 主要过牌或跟注，偶尔弃牌（10%概率）
  private decideLv1(player: Player, room: Room, phase: GamePhase, communityCards: Card[], seed: number): AIAction {
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;
    const rand = this.seededRandom(seed);

    // 计算手牌强度
    const handStrength = player.holeCards
      ? this.evaluateHandStrength(player.holeCards, communityCards, phase)
      : 0;

    // 弱牌时10%概率弃牌
    if (!canCheck && handStrength < 0.3 && rand < 0.1) {
      return { action: 'fold' };
    }

    // 优先选择 check（当不需要跟注时）
    if (canCheck) {
      return { action: 'check' };
    }

    // 如果需要跟注，根据手牌强度决策
    if (handStrength > 0.5) {
      // 好牌：加注（30%概率，不是每次都加）
      if (player.chips > maxBet - player.currentBet + room.minRaise && rand < 0.3) {
        const raiseAmount = this.calculateRaiseAmountLimited(room, player, maxBet, seed);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    // 一般牌：跟注
    if (callAmount > 0 && player.chips >= callAmount) {
      return { action: 'call' };
    }

    // 没筹码了才全压
    return player.chips > 0 ? { action: 'all_in' } : { action: 'check' };
  }

  // Lv2: 概率型 - 根据手牌强度决策，合理使用弃牌
  private decideLv2(player: Player, room: Room, phase: GamePhase, communityCards: Card[], seed: number): AIAction {
    if (!player.holeCards) return { action: 'check' };

    const handStrength = this.evaluateHandStrength(player.holeCards, communityCards, phase);
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;
    const potOdds = this.calculatePotOdds(callAmount, room.pot);
    const rand = this.seededRandom(seed);

    // 如果不需要跟注(callAmount=0)，直接过牌
    if (callAmount <= 0) {
      return { action: 'check' };
    }

    // 极弱牌（<0.2）：根据赔率决定是否弃牌
    if (handStrength < 0.2) {
      // 赔率极差时考虑弃牌（15%概率）
      if (potOdds > 0.3 && rand < 0.15) {
        return { action: 'fold' };
      }
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        return { action: 'call' };
      }
      // 只有没筹码时才 all-in
      return player.chips > 0 ? { action: 'all_in' } : { action: 'check' };
    }

    // 强牌：加注（40%概率）
    if (handStrength > 0.7) {
      if (player.chips > maxBet - player.currentBet + room.minRaise && rand < 0.4) {
        const raiseAmount = this.calculateRaiseAmountLimited(room, player, maxBet, seed);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    // 中等牌：根据赔率决策
    if (handStrength > 0.4) {
      if (potOdds < handStrength) {
        return canCheck ? { action: 'check' } : { action: 'call' };
      }
      // 赔率不好但还可以
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        return { action: 'call' };
      }
      // 中等牌不轻易全压，只有20%概率
      return rand < 0.2 ? { action: 'all_in' } : { action: 'call' };
    }

    // 弱牌（0.2-0.4）：过牌或跟注，小概率弃牌
    if (canCheck) {
      return { action: 'check' };
    }
    // 如果不能过牌但有筹码，选择跟注
    if (callAmount > 0 && player.chips >= callAmount) {
      // 10%概率弃牌
      if (rand < 0.1) {
        return { action: 'fold' };
      }
      return { action: 'call' };
    }
    // 只能 all-in
    return { action: 'all_in' };
  }

  // Lv3: 策略型 - 综合考虑位置、赔率、对手，合理弃牌，减少全压
  private decideLv3(player: Player, room: Room, phase: GamePhase, communityCards: Card[], seed: number): AIAction {
    if (!player.holeCards) return { action: 'check' };

    const handStrength = this.evaluateHandStrength(player.holeCards, communityCards, phase);
    const maxBet = this.getMaxBet(room);
    const canCheck = player.currentBet >= maxBet;
    const callAmount = maxBet - player.currentBet;
    const potOdds = this.calculatePotOdds(callAmount, room.pot);
    const rand = this.seededRandom(seed);

    // 如果不需要跟注(callAmount=0)，直接过牌
    if (callAmount <= 0) {
      return { action: 'check' };
    }

    // 位置因素：后位更有利
    const positionFactor = this.getPositionFactor(player, room);
    const adjustedStrength = handStrength * positionFactor;

    // 对手因素
    const opponentFactor = this.getOpponentFactor(player, room);

    // 极弱牌：更可能弃牌
    if (adjustedStrength < 0.15) {
      // 赔率差时30%概率弃牌
      if (potOdds > 0.25 && rand < 0.3) {
        return { action: 'fold' };
      }
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        // Lv3 极弱牌选择跟注而非全压（除非没选择了）
        return { action: 'call' };
      }
      // 只有完全没选择时才全压
      return player.chips > 0 ? { action: 'all_in' } : { action: 'check' };
    }

    // 综合决策 - 只有极强牌才加注
    if (adjustedStrength > 0.75 && opponentFactor > 0.5) {
      if (player.chips > maxBet - player.currentBet + room.minRaise) {
        const raiseAmount = this.calculateRaiseAmountLimited(room, player, maxBet, seed);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    // 中等偏强：优先跟注，减少加注和全压
    if (adjustedStrength > 0.5) {
      if (potOdds < adjustedStrength) {
        return canCheck ? { action: 'check' } : { action: 'call' };
      }
      // Lv3 即使赔率不好也倾向于跟注而非全压
      if (canCheck) {
        return { action: 'check' };
      }
      if (callAmount > 0 && player.chips >= callAmount) {
        return { action: 'call' };
      }
      // Lv3 中等牌只15%概率全压
      return rand < 0.15 ? { action: 'all_in' } : { action: 'call' };
    }

    // 弱牌但能过牌
    if (canCheck) {
      return { action: 'check' };
    }

    // 后面位置或赔率好可以跟注，否则尝试弃牌或跟注
    if (positionFactor > 1.2 || potOdds < adjustedStrength) {
      if (player.chips >= callAmount) {
        // Lv3 只有5%概率弃牌
        if (rand < 0.05) {
          return { action: 'fold' };
        }
        return { action: 'call' };
      }
    }

    // 弱牌选择全压的概率降到10%以内
    if (player.chips > 0 && rand < 0.1) {
      return { action: 'all_in' };
    }

    // 没选择时只能全压
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

  // 计算加注金额（限制最大为MAX_BET=1000）
  private calculateRaiseAmountLimited(room: Room, player: Player, maxBet: number, seed: number): number {
    // 最小需要加注到的金额
    const minRequired = maxBet + room.minRaise - player.currentBet;

    // 限制额外加注最大为 MAX_BET
    const maxExtraRaise = Math.min(MAX_BET, player.chips - minRequired);
    if (maxExtraRaise <= 0) {
      return minRequired;
    }

    // 使用种子生成伪随机数
    const rand = this.seededRandom(seed);
    const extraRaise = Math.floor(rand * maxExtraRaise) + 1;
    return minRequired + extraRaise;
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
