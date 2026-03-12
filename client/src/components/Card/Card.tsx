import React from 'react';
import type { Card as CardType } from '../../store/gameStore';
import './Card.css';

interface CardProps {
  card: CardType | null;
  hidden?: boolean;
  small?: boolean;
  animate?: boolean;
  delay?: number;
}

const suitColors: Record<string, string> = {
  '♠': 'black',
  '♥': 'red',
  '♦': 'red',
  '♣': 'black',
};

export const Card: React.FC<CardProps> = ({ card, hidden = false, small = false, animate = false, delay = 0 }) => {
  const delayStyle = delay > 0 ? { animationDelay: `${delay}s` } : {};

  if (!card) {
    return <div className={`card card-empty ${small ? 'card-small' : ''} ${animate ? 'card-deal' : ''}`} style={delayStyle} />;
  }

  if (hidden) {
    return <div className={`card card-back ${small ? 'card-small' : ''} ${animate ? 'card-deal' : ''}`} style={delayStyle} />;
  }

  const color = suitColors[card.suit] || 'black';
  const isRed = color === 'red';

  return (
    <div className={`card ${small ? 'card-small' : ''} ${animate ? 'card-deal' : ''}`} style={delayStyle}>
      <div className={`card-corner card-top-left ${isRed ? 'red' : 'black'}`}>
        <span>{card.rank}</span>
        <span>{card.suit}</span>
      </div>
      <div className={`card-center ${isRed ? 'red' : 'black'}`}>
        {card.suit}
      </div>
      <div className={`card-corner card-bottom-right ${isRed ? 'red' : 'black'}`}>
        <span>{card.rank}</span>
        <span>{card.suit}</span>
      </div>
    </div>
  );
};
