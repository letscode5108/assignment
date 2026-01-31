// controllers/socketController.js
const kafkaProducer = require('../services/kafkaProducer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const GameLogic = require('../utils/gameLogic');
const BotPlayer = require('../utils/botPlayer');

// In-memory game state
const activeGames = new Map();
const waitingPlayers = new Map();
const playerSockets = new Map();
const disconnectedPlayers = new Map();

class SocketController {
  handleSocketConnection(socket, io) {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join_game', async (data) => {
      await this.handleJoinGame(socket, io, data);
    });

    socket.on('make_move', async (data) => {
      await this.handleMakeMove(socket, io, data);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket, io);
    });

    socket.on('reconnect_game', async (data) => {
      await this.handleReconnect(socket, io, data);
    });
  }

  async handleJoinGame(socket, io, data) {
    try {
      const { username } = data;

      if (!username) {
        socket.emit('error', { message: 'Username is required' });
        return;
      }

      // Find or create player
      let player = await prisma.player.findUnique({
        where: { username }
      });

      if (!player) {
        player = await prisma.player.create({
          data: { username }
        });
      
// ✅ Send player_created event
      await kafkaProducer.sendEvent('game-analytics', {
        type: 'player_created',
        playerId: player.id,
        username: player.username
      });
    }

    // ✅ Send player_joined_queue event
    await kafkaProducer.sendEvent('game-analytics', {
      type: 'player_joined_queue',
      playerId: player.id,
      username: player.username
    });
      playerSockets.set(player.id, socket.id);
      socket.data.playerId = player.id;
      socket.data.username = username;

      // Check if there's a waiting player
      const waitingPlayer = Array.from(waitingPlayers.values())[0];

      if (waitingPlayer && waitingPlayer.playerId !== player.id) {
        // Match with waiting player
        await this.createMatchedGame(socket, io, player, waitingPlayer);
      } else {
        // Add to waiting queue
        waitingPlayers.set(player.id, {
          playerId: player.id,
          username: player.username,
          socketId: socket.id,
          timestamp: Date.now()
        });

        socket.emit('waiting_for_opponent', { message: 'Waiting for opponent...' });

        // Start timeout for bot match (3 seconds)
        setTimeout(async () => {
          if (waitingPlayers.has(player.id)) {
            await this.createBotGame(socket, io, player);
          }
        }, 30000);
      }
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  }

  async createMatchedGame(socket, io, player, waitingPlayer) {
    waitingPlayers.delete(waitingPlayer.playerId);

    const game = await prisma.game.create({
      data: {
        player1Id: waitingPlayer.playerId,
        player2Id: player.id,
        player2IsBot: false,
        board: GameLogic.createEmptyBoard(),
        currentTurn: waitingPlayer.playerId,
        status: 'active'
      },
      include: {
        player1: true,
        player2: true
      }
    });
    // Send game_started event
  await kafkaProducer.sendEvent('game-analytics', {
    type: 'game_started',
    gameId: game.id,
    player1Id: waitingPlayer.playerId,
    player2Id: player.id,
    player1Username: waitingPlayer.username,
    player2Username: player.username,
    vsBot: false
  });

    activeGames.set(game.id, {
      ...game,
      startTime: Date.now(),
      player1SocketId: waitingPlayer.socketId,
      player2SocketId: socket.id
    });

    const player1Socket = io.sockets.sockets.get(waitingPlayer.socketId);
    if (player1Socket) {
      player1Socket.join(game.id);
      player1Socket.emit('game_started', {
        game,
        playerNumber: 1,
        color: 'red',
        opponent: player.username
      });
    }

    socket.join(game.id);
    socket.emit('game_started', {
      game,
      playerNumber: 2,
      color: 'yellow',
      opponent: waitingPlayer.username
    });
  }

  async createBotGame(socket, io, player) {
    waitingPlayers.delete(player.id);

    const game = await prisma.game.create({
      data: {
        player1Id: player.id,
        player2IsBot: true,
        board: GameLogic.createEmptyBoard(),
        currentTurn: player.id,
        status: 'active'
      },
      include: {
        player1: true
      }
    });
    // Send game_started event (vs bot)
  await kafkaProducer.sendEvent('game-analytics', {
    type: 'game_started',
    gameId: game.id,
    player1Id: player.id,
    player1Username: player.username,
    vsBot: true
  });

    activeGames.set(game.id, {
      ...game,
      startTime: Date.now(),
      player1SocketId: socket.id,
      isBot: true
    });

    socket.join(game.id);
    socket.emit('game_started', {
      game,
      playerNumber: 1,
      color: 'red',
      opponent: 'Bot'
    });
  }

async handleMakeMove(socket, io, data) {
  try {
    const { gameId, column } = data;
    const playerId = socket.data.playerId;

    if (column < 0 || column > 6) {
      socket.emit('error', { message: 'Invalid column' });
      return;
    }

    const gameState = activeGames.get(gameId);
    if (!gameState) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (gameState.status !== 'active') {
      socket.emit('error', { message: 'Game is not active' });
      return;
    }

    // ✅ FIX: This is the important part
    if (gameState.currentTurn !== playerId) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const board = gameState.board;
    const row = GameLogic.getAvailableRow(board, column);

    if (row === -1) {
      socket.emit('error', { message: 'Column is full' });
      return;
    }

    // Make the move
    const playerColor = gameState.player1Id === playerId ? 'red' : 'yellow';
    board[row][column] = playerColor;

    // Check for win
    const winResult = GameLogic.checkWin(board, row, column, playerColor);

    if (winResult.won) {
      await this.handleGameEnd(io, gameId, gameState, playerId, winResult.type, winResult.cells);
      return;
    }

    // Check for draw
    if (GameLogic.isBoardFull(board)) {
      await this.handleGameEnd(io, gameId, gameState, null, 'draw', []);
      return;
    }

    // ✅ FIX: Switch turn properly
    const nextPlayer = gameState.player1Id === playerId ? 
      (gameState.player2Id || 'bot') : gameState.player1Id;

    gameState.currentTurn = nextPlayer;
    gameState.board = board;

    // Emit move to all players in game
    io.to(gameId).emit('move_made', {
      row,
      column,
      color: playerColor,
      nextTurn: nextPlayer,
      board
    });
    //✅ Send move_made event
await kafkaProducer.sendEvent('game-analytics', {
  type: 'move_made',
  gameId,
  playerId,
  column,
  row,
  color: playerColor
});

    // If bot's turn, make bot move
    if (gameState.isBot && nextPlayer === 'bot') {
      setTimeout(() => {
        this.makeBotMove(io, gameId, gameState);
      }, 500);
    }
  } catch (error) {
    console.error('Make move error:', error);
    socket.emit('error', { message: 'Failed to make move' });
  }
}

  async makeBotMove(io, gameId, gameState) {
    const board = gameState.board;
    const column = BotPlayer.getBestMove(board, 'yellow', 'red');

    if (column === -1) return;

    const row = GameLogic.getAvailableRow(board, column);
    board[row][column] = 'yellow';

    const winResult = GameLogic.checkWin(board, row, column, 'yellow');

    if (winResult.won) {
      await this.handleGameEnd(io, gameId, gameState, 'bot', winResult.type, winResult.cells);
      return;
    }

    if (GameLogic.isBoardFull(board)) {
      await this.handleGameEnd(io, gameId, gameState, null, 'draw', []);
      return;
    }

    gameState.currentTurn = gameState.player1Id;
    gameState.board = board;

    io.to(gameId).emit('move_made', {
      row,
      column,
      color: 'yellow',
      nextTurn: gameState.player1Id,
      board
    });
  }

  async handleGameEnd(io, gameId, gameState, winnerId, winType, winningCells) {
    const duration = Math.floor((Date.now() - gameState.startTime) / 1000);

    gameState.status = 'completed';
    gameState.winner = winnerId;
    gameState.winType = winType;

    // Update database
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'completed',
        winner: winnerId === 'bot' ? 'bot' : winnerId,
        winType,
        completedAt: new Date(),
        duration
      }
    });
//✅ Send game_ended event
  await kafkaProducer.sendEvent('game-analytics', {
    type: 'game_ended',
    gameId,
    winnerId: winnerId === 'bot' ? 'bot' : winnerId,
    loserId: gameState.player1Id === winnerId ? gameState.player2Id : gameState.player1Id,
    winType,
    duration,
    vsBot: gameState.isBot || false,
    player1Id: gameState.player1Id,
    player2Id: gameState.player2Id
  });
    // Update player stats
    if (winnerId && winnerId !== 'bot') {
      await prisma.player.update({
        where: { id: winnerId },
        data: { gamesWon: { increment: 1 } }
      });

      const loserId = gameState.player1Id === winnerId ? 
        gameState.player2Id : gameState.player1Id;
      
      if (loserId) {
        await prisma.player.update({
          where: { id: loserId },
          data: { gamesLost: { increment: 1 } }
        });
      }
    } else if (winType === 'draw') {
      await prisma.player.update({
        where: { id: gameState.player1Id },
        data: { gamesDrawn: { increment: 1 } }
      });
      if (gameState.player2Id) {
        await prisma.player.update({
          where: { id: gameState.player2Id },
          data: { gamesDrawn: { increment: 1 } }
        });
      }
    } else if (winnerId === 'bot') {
      await prisma.player.update({
        where: { id: gameState.player1Id },
        data: { gamesLost: { increment: 1 } }
      });
    }

    io.to(gameId).emit('game_ended', {
      winner: winnerId,
      winType,
      board: gameState.board,
      duration,
      winningCells
    });

    activeGames.delete(gameId);
  }

  handleDisconnect(socket) {
    console.log(`Client disconnected: ${socket.id}`);
    
    const playerId = socket.data.playerId;
    if (!playerId) return;

    // Remove from waiting players
    waitingPlayers.delete(playerId);

    // Find active game
    for (const [gameId, gameState] of activeGames.entries()) {
      if (gameState.player1Id === playerId || gameState.player2Id === playerId) {
        // Start 30 second timer
        disconnectedPlayers.set(playerId, {
          gameId,
          timestamp: Date.now(),
          timeout: setTimeout(async () => {
            await this.forfeitGame(gameId, gameState, playerId);
          }, 30000)
        });
        break;
      }
    }

    playerSockets.delete(playerId);
  }

  async handleReconnect(socket, io, data) {
    const { username, gameId } = data;

    const player = await prisma.player.findUnique({
      where: { username }
    });

    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }

    const disconnectInfo = disconnectedPlayers.get(player.id);
    if (disconnectInfo && disconnectInfo.gameId === gameId) {
      clearTimeout(disconnectInfo.timeout);
      disconnectedPlayers.delete(player.id);

      playerSockets.set(player.id, socket.id);
      socket.data.playerId = player.id;
      socket.data.username = username;

      const gameState = activeGames.get(gameId);
      if (gameState) {
        socket.join(gameId);
        socket.emit('game_reconnected', {
          game: gameState,
          playerNumber: gameState.player1Id === player.id ? 1 : 2
        });
      }
    }
  }

  async forfeitGame(gameId, gameState, playerId) {
    const winnerId = gameState.player1Id === playerId ? 
      gameState.player2Id : gameState.player1Id;

    const duration = Math.floor((Date.now() - gameState.startTime) / 1000);

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'forfeited',
        winner: winnerId || 'bot',
        completedAt: new Date(),
        duration
      }
    });

    if (winnerId && winnerId !== 'bot') {
      await prisma.player.update({
        where: { id: winnerId },
        data: { gamesWon: { increment: 1 } }
      });
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { gamesLost: { increment: 1 } }
    });

    activeGames.delete(gameId);
    disconnectedPlayers.delete(playerId);
  }
}

// Export a single instance
const socketController = new SocketController();

module.exports = {
  handleSocketConnection: (socket, io) => socketController.handleSocketConnection(socket, io)
};