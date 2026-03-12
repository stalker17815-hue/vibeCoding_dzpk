import React from 'react';
import './ShuffleAnimation.css';

interface ShuffleAnimationProps {
  isActive: boolean;
}

export const ShuffleAnimation: React.FC<ShuffleAnimationProps> = ({ isActive }) => {
  if (!isActive) return null;

  return (
    <div className="shuffle-overlay">
      <div className="shuffle-container">
        <div className="shuffle-title">洗牌中...</div>
        <div className="shuffle-cards">
          <div className="shuffle-card card-1">🃏</div>
          <div className="shuffle-card card-2">🃏</div>
          <div className="shuffle-card card-3">🃏</div>
          <div className="shuffle-card card-4">🃏</div>
          <div className="shuffle-card card-5">🃏</div>
        </div>
        <div className="shuffle-progress">
          <div className="shuffle-progress-bar"></div>
        </div>
      </div>
    </div>
  );
};
