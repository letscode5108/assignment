// utils/botPlayer.js
const GameLogic = require('./gameLogic');

class BotPlayer {
  getBestMove(board, botColor, opponentColor) {
    const validMoves = GameLogic.getValidMoves(board);
    
    if (validMoves.length === 0) return -1;

    // 1. Check if bot can win
    for (const col of validMoves) {
      const row = GameLogic.getAvailableRow(board, col);
      board[row][col] = botColor;
      const result = GameLogic.checkWin(board, row, col, botColor);
      board[row][col] = null;
      
      if (result.won) {
        return col;
      }
    }

    // 2. Block opponent's winning move
    for (const col of validMoves) {
      const row = GameLogic.getAvailableRow(board, col);
      board[row][col] = opponentColor;
      const result = GameLogic.checkWin(board, row, col, opponentColor);
      board[row][col] = null;
      
      if (result.won) {
        return col;
      }
    }

    // 3. Check for setup moves (creating threats)
    const setupMove = this.findSetupMove(board, botColor, validMoves);
    if (setupMove !== -1) {
      return setupMove;
    }

    // 4. Prefer center columns
    const centerMoves = validMoves.filter(col => col >= 2 && col <= 4);
    if (centerMoves.length > 0) {
      return centerMoves[Math.floor(Math.random() * centerMoves.length)];
    }

    // 5. Random valid move
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  findSetupMove(board, botColor, validMoves) {
    for (const col of validMoves) {
      const row = GameLogic.getAvailableRow(board, col);
      board[row][col] = botColor;
      
      // Check if this move creates multiple winning opportunities
      const threats = this.countThreats(board, botColor);
      board[row][col] = null;
      
      if (threats >= 2) {
        return col;
      }
    }
    return -1;
  }

  countThreats(board, color) {
    let threats = 0;
    const validMoves = GameLogic.getValidMoves(board);
    
    for (const col of validMoves) {
      const row = GameLogic.getAvailableRow(board, col);
      board[row][col] = color;
      const result = GameLogic.checkWin(board, row, col, color);
      board[row][col] = null;
      
      if (result.won) {
        threats++;
      }
    }
    
    return threats;
  }
}

module.exports = new BotPlayer();