import React, { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import type { AILv } from '../../store/gameStore';
import './Home.css';

export const Home: React.FC = () => {
  const { isConnected, room, createRoom, joinRoom, addAI, kickPlayer, setBlind, startGame, leaveRoom, isLoading, error } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [sb] = useState(10);
  const [bb] = useState(20);

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('请输入你的名字');
      return;
    }
    createRoom(playerName, sb, bb);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('请输入你的名字');
      return;
    }
    if (!joinCode.trim()) {
      alert('请输入房间号');
      return;
    }
    joinRoom(joinCode, playerName);
    setShowJoinModal(false);
  };

  const handleAddAI = (level: AILv) => {
    addAI(level);
  };

  const handleKickPlayer = (seatIndex: number) => {
    kickPlayer(seatIndex);
  };

  const handleStartGame = () => {
    console.log('handleStartGame clicked, room:', room);
    startGame();
  };

  const blindOptions = [
    { sb: 5, bb: 10 },
    { sb: 10, bb: 20 },
    { sb: 25, bb: 50 },
    { sb: 50, bb: 100 },
    { sb: 100, bb: 200 },
  ];

  // 等待房间界面
  if (room && room.status === 'waiting') {
    const me = room.players.find(p => p.isHost);
    const isHost = me?.isHost;

    return (
      <div className="home-container">
        <div className="room-waiting">
          <h2>等待房间</h2>

          <div className="room-code-display">
            <span>房间号: </span>
            <span className="code">{room.code}</span>
          </div>

          {/* 盲注设置（房主） */}
          {isHost && (
            <div className="blind-setting">
              <h4>设置盲注</h4>
              <div className="blind-options">
                {blindOptions.map(opt => (
                  <button
                    key={`${opt.sb}-${opt.bb}`}
                    className={room.sb === opt.sb && room.bb === opt.bb ? 'active' : ''}
                    onClick={() => setBlind(opt.sb, opt.bb)}
                  >
                    {opt.sb}/{opt.bb}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 玩家列表 */}
          <div className="player-list">
            <h4>玩家列表 ({room.players.length}/{room.maxPlayers})</h4>
            <ul>
              {room.players.map(player => (
                <li key={player.id} className={player.isHost ? 'host' : ''}>
                  <span className="player-name">
                    {player.name}
                    {player.isHost && <span className="host-badge">房主</span>}
                    {player.type === 'ai' && <span className="ai-badge">AI</span>}
                  </span>
                  <span className="player-chips">💰 1000</span>
                  {isHost && !player.isHost && player.type === 'ai' && (
                    <button
                      className="kick-btn"
                      onClick={() => handleKickPlayer(player.seatIndex)}
                    >
                      踢出
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* 添加AI（房主） */}
          {isHost && room.players.length < room.maxPlayers && (
            <div className="add-ai">
              <h4>添加AI对手</h4>
              <div className="ai-buttons">
                <button onClick={() => handleAddAI(1)}>Lv1 陪练型</button>
                <button onClick={() => handleAddAI(2)}>Lv2 概率型</button>
                <button onClick={() => handleAddAI(3)}>Lv3 策略型</button>
              </div>
            </div>
          )}

          {/* 开始游戏按钮 */}
          {isHost && room.players.length >= 2 && (
            <button className="start-game-btn" onClick={handleStartGame}>
              开始游戏
            </button>
          )}

          {room.players.length < 2 && (
            <p className="hint">至少需要2名玩家才能开始游戏</p>
          )}

          <button className="leave-btn" onClick={leaveRoom}>
            离开房间
          </button>
        </div>
      </div>
    );
  }

  // 初始首页
  return (
    <div className="home-container">
      <div className="home-content">
        <h1>🃏 德州扑克</h1>

        {!isConnected && (
          <div className="connection-error">
            未连接到服务器，请检查网络
          </div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        <div className="name-input">
          <label>你的名字:</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="输入你的昵称"
            maxLength={12}
          />
        </div>

        <div className="home-buttons">
          <button
            className="create-room-btn"
            onClick={handleCreateRoom}
            disabled={!isConnected || isLoading || !playerName.trim()}
          >
            {isLoading ? '创建中...' : '创建房间'}
          </button>

          <button
            className="join-room-btn"
            onClick={() => setShowJoinModal(true)}
            disabled={!isConnected || !playerName.trim()}
          >
            加入房间
          </button>
        </div>

        {/* 加入房间弹窗 */}
        {showJoinModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>加入房间</h3>
              <div className="modal-input">
                <label>房间号:</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="输入6位房间号"
                  maxLength={6}
                />
              </div>
              <div className="modal-buttons">
                <button onClick={handleJoinRoom} disabled={!joinCode.trim()}>
                  加入
                </button>
                <button className="cancel" onClick={() => setShowJoinModal(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
