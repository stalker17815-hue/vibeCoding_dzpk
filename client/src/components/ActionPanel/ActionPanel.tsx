import React, { useState } from 'react';
import type { ActionType } from '../../store/gameStore';
import './ActionPanel.css';

interface ActionPanelProps {
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  canAllIn: boolean;
  minRaise: number;
  maxRaise: number;
  onAction: (action: ActionType, amount?: number) => void;
  disabled: boolean;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  canCheck,
  canCall,
  canRaise,
  canAllIn,
  minRaise,
  maxRaise,
  onAction,
  disabled,
}) => {
  const [raiseAmount, setRaiseAmount] = useState(minRaise);
  const [showRaiseInput, setShowRaiseInput] = useState(false);

  const handleRaise = () => {
    if (showRaiseInput) {
      onAction('raise', raiseAmount);
      setShowRaiseInput(false);
    } else {
      setShowRaiseInput(true);
    }
  };

  return (
    <div className={`action-panel ${disabled ? 'disabled' : ''}`}>
      <div className="action-buttons">
        <button
          className="action-btn fold"
          onClick={() => onAction('fold')}
          disabled={disabled}
        >
          弃牌
        </button>

        <button
          className="action-btn check"
          onClick={() => onAction('check')}
          disabled={disabled || !canCheck}
        >
          过牌
        </button>

        <button
          className="action-btn call"
          onClick={() => onAction('call')}
          disabled={disabled || !canCall}
        >
          跟注
        </button>

        <button
          className="action-btn raise"
          onClick={handleRaise}
          disabled={disabled || !canRaise}
        >
          {showRaiseInput ? '确认加注' : '加注'}
        </button>

        <button
          className="action-btn all-in"
          onClick={() => onAction('all_in')}
          disabled={disabled || !canAllIn}
        >
          全下
        </button>
      </div>

      {showRaiseInput && (
        <div className="raise-input">
          <label>
            加注金额:
            <input
              type="range"
              min={minRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
            />
            <span className="raise-amount">{raiseAmount}</span>
          </label>
        </div>
      )}
    </div>
  );
};
