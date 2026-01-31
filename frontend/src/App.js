// src/App.js
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const SOCKET_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';


function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [gameState, setGameState] = useState(null);
  const [board, setBoard] = useState(Array(6).fill(null).map(() => Array(7).fill(null)));
  const [status, setStatus] = useState('Enter username to start');
  const [playerColor, setPlayerColor] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [winningCells, setWinningCells] = useState([]); 
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('waiting_for_opponent', (data) => {
      setStatus(' Waiting for opponent... (Bot will join in 30s)');
    });

    socket.on('game_started', (data) => {
      setGameState(data.game);
      setBoard(data.game.board);
      setPlayerColor(data.color);
      setIsMyTurn(data.playerNumber === 1);
      const myPlayerNumber = data.playerNumber;
    localStorage.setItem('myPlayerNumber', myPlayerNumber);
    setIsMyTurn(data.playerNumber === 1);
      setWinningCells([]); 
        const opponentText = data.opponent ? `Playing vs ${data.opponent}` : 'Waiting...';
      
      setStatus(` Game started! You are ${data.color}.${opponentText}`);
    });

    socket.on('move_made', (data) => {
      setBoard(data.board);
          const myPlayerNumber = parseInt(localStorage.getItem('myPlayerNumber'));
let isMyTurnNow = false;
    if (data.nextTurn === 'bot') {
      isMyTurnNow = false;
    } else if (gameState) {
      // Check if nextTurn matches my player ID
      if (myPlayerNumber === 1) {
        isMyTurnNow = data.nextTurn === gameState.player1Id;
      } else {
        isMyTurnNow = data.nextTurn === gameState.player2Id;
      }
    }
    
    setIsMyTurn(isMyTurnNow);
      //setIsMyTurn(data.nextTurn !== 'bot' && gameState && data.nextTurn === gameState.player1Id);
      setStatus(`${data.color === playerColor ? 'Your' : 'Opponent'} move at column ${data.column + 1}`);
    });

    socket.on('game_ended', (data) => {
      setBoard(data.board);
      setIsMyTurn(false);
      setWinningCells(data.winningCells || []); // ✅ Set winning cells
      
      let resultMessage = '';
      if (data.winType === 'draw') {
        resultMessage = '🤝 Game ended in a draw!';
      } else if (data.winner === 'bot') {
        resultMessage = '🤖 Bot wins!';
      } else {
         const myPlayerNumber = parseInt(localStorage.getItem('myPlayerNumber'));
    const iWon = (myPlayerNumber === 1 && data.winner === gameState?.player1Id) ||
                 (myPlayerNumber === 2 && data.winner === gameState?.player2Id);
    
    resultMessage = iWon ? '🎉 You win!' : '😢 You lose!';
        // resultMessage = data.winner === gameState?.player1Id ? '🎉 You win!' : '😢 You lose!';
      }
      
      setStatus(`${resultMessage} (${data.winType}) - Duration: ${data.duration}s`);
      fetchLeaderboard();
    });

    socket.on('error', (error) => {
      setStatus(`❌ Error: ${error.message}`);
    });

    return () => {
      socket.off('waiting_for_opponent');
      socket.off('game_started');
      socket.off('move_made');
      socket.off('game_ended');
      socket.off('error');
    };
  }, [socket, gameState, playerColor]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/leaderboard`);
      const data = await response.json();
      setLeaderboard(data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  };

  const handleJoinGame = () => {
    if (!username.trim()) {
      setStatus(' Please enter a username');
      return;
    }

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setStatus(' Connected to server');
      newSocket.emit('join_game', { username: username.trim() });
    });
  };

  const handleColumnClick = (column) => {
    if (!isMyTurn || !gameState) {
      setStatus(' Not your turn or game not started');
      return;
    }

    if (board[0][column] !== null) {
      setStatus(' Column is full');
      return;
    }

    socket.emit('make_move', {
      gameId: gameState.id,
      column: column
    });
  };

  const handleNewGame = () => {
    if (socket) {
      socket.disconnect();
    }
    setSocket(null);
    setGameState(null);
    setBoard(Array(6).fill(null).map(() => Array(7).fill(null)));
    setStatus('Enter username to start');
    setPlayerColor(null);
    setIsMyTurn(false);
    setWinningCells([]); 
  };

  //  Check if cell is part of winning line
  const isWinningCell = (row, col) => {
    return winningCells.some(cell => cell.row === row && cell.col === col);
  };

  return (
    <div className="App">
      <h1> 4 in a Row</h1>

      {!gameState ? (
        <div className="join-section">
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
          />
          <button onClick={handleJoinGame}>Join Game</button>
        </div>
      ) : (
        <button onClick={handleNewGame} className="new-game-btn">New Game</button>
      )}

      <div className="status">{status}</div>

      <div className="game-container">
        <div className="board-section">
          <div className="board">
            {board.map((row, rowIndex) => (
              <div key={rowIndex} className="row">
                {row.map((cell, colIndex) => (
                  <div
                    key={colIndex}
                    className={`cell ${cell || ''} ${isMyTurn ? 'clickable' : ''} ${isWinningCell(rowIndex, colIndex) ? 'winning' : ''}`}
                    onClick={() => handleColumnClick(colIndex)}
                  >
                    {cell && (
                      <div className={`disc ${cell}`}></div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="column-numbers">
            {[1, 2, 3, 4, 5, 6, 7].map(num => (
              <span key={num}>{num}</span>
            ))}
          </div>
        </div>

        <div className="leaderboard-section">
          <h2>🏆 Leaderboard</h2>
          <div className="leaderboard">
            {leaderboard.length === 0 ? (
              <p>No players yet</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>W/L</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player, index) => (
                    <tr key={index} className={player.username === username ? 'current-player' : ''}>
                      <td>{player.rank}</td>
                      <td>{player.username}</td>
                      <td>{player.wins}</td>
                      <td>{player.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;