import React from 'react';
import './PotDisplay.css';

interface PotDisplayProps {
  pot: number;
  sidePots: number[];
}

export const PotDisplay: React.FC<PotDisplayProps> = ({ pot, sidePots }) => {
  return (
    <div className="pot-display">
      <div className="main-pot">
        <span className="pot-label">底池</span>
        <span className="pot-amount">💰 {pot}</span>
      </div>
      {sidePots.length > 0 && (
        <div className="side-pots">
          {sidePots.map((amount, index) => (
            <div key={index} className="side-pot">
              边池{index + 1}: {amount}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
