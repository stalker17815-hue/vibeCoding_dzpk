import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// 空字符串表示连接同源地址（当前页面域名）
// 生产环境由 Nginx 代理 /socket.io/ 到后端容器
// 开发环境可通过 .env 设置为 http://localhost:3001
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// 创建 Context
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

// 全局 socket 实例
let globalSocket: Socket | null = null;
let globalSocketRefCount = 0;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 如果已经存在全局 socket，增加引用计数并重用
    if (globalSocket) {
      console.log('[Socket] Reusing existing socket');
      socketRef.current = globalSocket;
      setIsConnected(globalSocket.connected);
      globalSocketRefCount++;
    } else {
      console.log('[Socket] Creating new socket connection');
      globalSocket = io(SERVER_URL, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = globalSocket;
      globalSocketRefCount = 1;

      globalSocket.on('connect', () => {
        console.log('[Socket] Connected, id:', globalSocket?.id);
        setIsConnected(true);
        setError(null);
      });

      globalSocket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected, reason:', reason);
        setIsConnected(globalSocket?.connected || false);
      });

      globalSocket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        setError(err.message);
      });
    }

    return () => {
      // 页面切换时不断开连接
      console.log('[Socket] Cleanup called (not disconnecting)');
    };
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    if (socketRef.current) {
      socketRef.current.emit(event, ...args);
    }
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  }, []);

  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, error, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
}
