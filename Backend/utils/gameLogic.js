// utils/gameLogic.js
class GameLogic {
  createEmptyBoard() {
    return Array(6).fill(null).map(() => Array(7).fill(null));
  }

  getAvailableRow(board, column) {
    for (let row = 5; row >= 0; row--) {
      if (board[row][column] === null) {
        return row;
      }
    }
    return -1;
  }

  checkWin(board, row, col, color) {
    // Check horizontal
    const horizontalCells = this.checkDirection(board, row, col, color, 0, 1);
    if (horizontalCells.length >= 4) {
      return { won: true, type: 'horizontal', cells: horizontalCells };
    }

    // Check vertical
    const verticalCells = this.checkDirection(board, row, col, color, 1, 0);
    if (verticalCells.length >= 4) {
      return { won: true, type: 'vertical', cells: verticalCells };
    }

    // Check diagonal (top-left to bottom-right)
    const diag1Cells = this.checkDirection(board, row, col, color, 1, 1);
    if (diag1Cells.length >= 4) {
      return { won: true, type: 'diagonal', cells: diag1Cells };
    }

    // Check diagonal (bottom-left to top-right)
    const diag2Cells = this.checkDirection(board, row, col, color, -1, 1);
    if (diag2Cells.length >= 4) {
      return { won: true, type: 'diagonal', cells: diag2Cells };
    }

    return { won: false, cells: [] };
  }

  checkDirection(board, row, col, color, deltaRow, deltaCol) {
    const cells = [{ row, col }]; // Start with the placed disc

    // Check positive direction
    let r = row + deltaRow;
    let c = col + deltaCol;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === color) {
      cells.push({ row: r, col: c });
      r += deltaRow;
      c += deltaCol;
    }

    // Check negative direction
    r = row - deltaRow;
    c = col - deltaCol;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === color) {
      cells.push({ row: r, col: c });
      r -= deltaRow;
      c -= deltaCol;
    }

    return cells;
  }

  isBoardFull(board) {
    return board[0].every(cell => cell !== null);
  }

  getValidMoves(board) {
    const moves = [];
    for (let col = 0; col < 7; col++) {
      if (board[0][col] === null) {
        moves.push(col);
      }
    }
    return moves;
  }
}

module.exports = new GameLogic();