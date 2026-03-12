import { useGameStore } from './store/gameStore';
import { SocketProvider } from './hooks/useSocket';
import { Home } from './pages/Home';
import { Game } from './pages/Game';
import './App.css';

function AppContent() {
  const room = useGameStore((state) => state.room);

  // 根据房间状态显示不同页面
  if (room && (room.status === 'playing' || room.status === 'ended')) {
    return <Game />;
  }

  return <Home />;
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
