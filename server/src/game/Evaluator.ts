import { Card, HandType, HandResult, Rank } from '../types';
import { getRankValue, compareCards } from './Deck';

// 获取所有可能的5张牌组合
function getCombinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (cards.length === 0) return [];

  const first = cards[0];
  const rest = cards.slice(1);

  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);

  return [...withFirst, ...withoutFirst];
}

// 检查是否是同花
function isFlush(cards: Card[]): boolean {
  return cards.every(card => card.suit === cards[0].suit);
}

// 检查是否是顺子
function isStraight(cards: Card[]): boolean {
  const ranks = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
  const uniqueRanks = [...new Set(ranks)];

  // 特殊顺子: A-2-3-4-5 (A低顺)
  if (uniqueRanks.length === 5) {
    const maxRank = Math.max(...uniqueRanks);
    const minRank = Math.min(...uniqueRanks);

    // 普通顺子: 5张连续
    if (maxRank - minRank === 4) return true;

    // 特殊: A-2-3-4-5 (A低顺)
    if (uniqueRanks.includes(14) && uniqueRanks.includes(2) &&
        uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
      return true;
    }
  }

  return false;
}

// 获取顺子的高牌 (用于比较)
function getStraightHighCard(cards: Card[]): number {
  const ranks = [...new Set(cards.map(c => getRankValue(c.rank)))].sort((a, b) => b - a);

  // A低顺: A-2-3-4-5
  if (ranks.includes(14) && ranks.includes(2) && ranks.includes(3) &&
      ranks.includes(4) && ranks.includes(5)) {
    return 5; // A低顺的高牌是5
  }

  return ranks[0];
}

// 获取同花色的牌 (用于判断同花顺)
function getFlushCards(cards: Card[]): Card[] | null {
  const suits: Record<string, Card[]> = {};

  for (const card of cards) {
    if (!suits[card.suit]) suits[card.suit] = [];
    suits[card.suit].push(card);
  }

  for (const suitCards of Object.values(suits)) {
    if (suitCards.length >= 5) {
      return suitCards.sort(compareCards);
    }
  }

  return null;
}

// 统计每个点数的牌数
function getRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const value = getRankValue(card.rank);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

// 评估手牌
export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  const combinations = getCombinations(allCards, 5);

  let bestHand: HandResult = {
    type: 'high_card',
    rank: 0,
    kickers: []
  };
  let bestCards: Card[] = [];

  for (const combo of combinations) {
    const result = evaluate5Cards(combo);
    if (compareHands(result, bestHand) > 0) {
      bestHand = result;
      bestCards = combo;
    }
  }

  // 添加最佳5张牌到手牌结果中
  return {
    ...bestHand,
    handCards: bestCards
  };
}

// 评估5张牌的牌型
function evaluate5Cards(cards: Card[]): HandResult {
  const sortedCards = [...cards].sort(compareCards);
  const counts = getRankCounts(cards);
  const isFlushResult = isFlush(cards);
  const isStraightResult = isStraight(cards);

  // 皇家同花顺
  if (isFlushResult && isStraightResult && getStraightHighCard(cards) === 14) {
    return { type: 'royal_flush', rank: 14, kickers: [] };
  }

  // 同花顺
  if (isFlushResult && isStraightResult) {
    return { type: 'straight_flush', rank: getStraightHighCard(cards), kickers: [] };
  }

  // 四条
  for (const [rank, count] of counts) {
    if (count === 4) {
      const kickers = sortedCards
        .filter(c => getRankValue(c.rank) !== rank)
        .slice(0, 1)
        .map(c => getRankValue(c.rank));
      return { type: 'four_of_a_kind', rank, kickers };
    }
  }

  // 葫芦 (3+2)
  const threeOfAKind = [...counts.entries()].find(([, count]) => count === 3);
  const pairs = [...counts.entries()].filter(([, count]) => count === 2);

  if (threeOfAKind && pairs.length >= 1) {
    return {
      type: 'full_house',
      rank: threeOfAKind[0],
      kickers: [pairs[0][0]]
    };
  }

  // 同花
  if (isFlushResult) {
    return {
      type: 'flush',
      rank: sortedCards[0].rank === 'A' ? 14 : getRankValue(sortedCards[0].rank),
      kickers: sortedCards.slice(1).map(c => getRankValue(c.rank))
    };
  }

  // 顺子
  if (isStraightResult) {
    return { type: 'straight', rank: getStraightHighCard(cards), kickers: [] };
  }

  // 三条
  if (threeOfAKind) {
    const kickers = sortedCards
      .filter(c => getRankValue(c.rank) !== threeOfAKind[0])
      .slice(0, 2)
      .map(c => getRankValue(c.rank));
    return { type: 'three_of_a_kind', rank: threeOfAKind[0], kickers };
  }

  // 两对
  if (pairs.length >= 2) {
    const sortedPairs = pairs.sort((a, b) => b[0] - a[0]);
    const kicker = sortedCards
      .filter(c => getRankValue(c.rank) !== sortedPairs[0][0] && getRankValue(c.rank) !== sortedPairs[1][0])
      .slice(0, 1)
      .map(c => getRankValue(c.rank));
    return {
      type: 'two_pair',
      rank: sortedPairs[0][0] * 100 + sortedPairs[1][0],
      kickers: kicker
    };
  }

  // 一对
  if (pairs.length === 1) {
    const kickers = sortedCards
      .filter(c => getRankValue(c.rank) !== pairs[0][0])
      .slice(0, 3)
      .map(c => getRankValue(c.rank));
    return { type: 'one_pair', rank: pairs[0][0], kickers };
  }

  // 高牌
  return {
    type: 'high_card',
    rank: getRankValue(sortedCards[0].rank),
    kickers: sortedCards.slice(1).map(c => getRankValue(c.rank))
  };
}

// 比较两手牌的大小 (返回正数表示a更大)
export function compareHands(a: HandResult, b: HandResult): number {
  const typeOrder: Record<HandType, number> = {
    'royal_flush': 10,
    'straight_flush': 9,
    'four_of_a_kind': 8,
    'full_house': 7,
    'flush': 6,
    'straight': 5,
    'three_of_a_kind': 4,
    'two_pair': 3,
    'one_pair': 2,
    'high_card': 1
  };

  const orderA = typeOrder[a.type];
  const orderB = typeOrder[b.type];

  if (orderA !== orderB) return orderA - orderB;

  // 相同牌型，比较rank
  if (a.rank !== b.rank) return a.rank - b.rank;

  // 比较踢脚牌
  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const kickerA = a.kickers[i] || 0;
    const kickerB = b.kickers[i] || 0;
    if (kickerA !== kickerB) return kickerA - kickerB;
  }

  return 0;
}

// 获取牌型名称 (中文)
export function getHandTypeName(type: HandType): string {
  const names: Record<HandType, string> = {
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
  return names[type];
}
