import { Card, Suit, Rank } from '../types';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 获取牌面点数值 (2-14, A=14)
export function getRankValue(rank: Rank): number {
  const rankOrder: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankOrder[rank];
}

// 创建一副标准52张牌
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

// Fisher-Yates 洗牌算法
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 发牌 - 从牌堆顶部取牌
export function dealCard(deck: Card[]): Card | undefined {
  return deck.pop();
}

// 发多张牌
export function dealCards(deck: Card[], count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = dealCard(deck);
    if (card) cards.push(card);
  }
  return cards;
}

// 牌面比较 (用于排序)
export function compareCards(a: Card, b: Card): number {
  return getRankValue(b.rank) - getRankValue(a.rank);
}

// 获取牌的字符串表示
export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

// 解析牌字符串
export function stringToCard(str: string): Card {
  const suit = str.slice(-1) as Suit;
  const rank = str.slice(0, -1) as Rank;
  return { suit, rank };
}
