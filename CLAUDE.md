# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **real-time multiplayer poker game** with AI players. The project uses a client-server architecture:

- **Client**: React 19 + TypeScript + Vite + Zustand (state management) + Socket.io-client
- **Server**: Express + Socket.io + TypeScript

## Commands

### Development

```bash
# Start both client and server (from root)
cd client && npm run dev   # Client runs on http://localhost:5173
cd server && npm run dev  # Server runs on port 3001
```

### Build

```bash
# Client
cd client && npm run build

# Server
cd server && npm run build
```

### Linting

```bash
cd client && npm run lint
```

## Architecture

### Client Structure (`client/src/`)

- `pages/` - Route-level components (Home, Game)
- `components/` - Reusable UI components (Card, PokerTable, PlayerSeat, ActionPanel, PotDisplay)
- `hooks/` - Custom hooks (useSocket, useGame)
- `store/` - Zustand state management (gameStore)

### Server Structure (`server/src/`)

- `game/` - Core game logic (Deck, Evaluator, GameFlow)
- `room/` - Room management (RoomManager)
- `ai/` - AI player logic (AIController)
- `socket/` - Socket.io event handlers

### Communication

Client and server communicate via Socket.io events. The server manages game state and broadcasts updates to connected clients.

## Key Files

- `client/src/store/gameStore.ts` - Central state management
- `client/src/hooks/useSocket.tsx` - Socket connection provider
- `server/src/socket/handlers.ts` - Socket event handlers
- `server/src/game/GameFlow.ts` - Core game state machine
