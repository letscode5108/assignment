// src/App.js
import React, { useState, useEffect, useRef } from 'react';
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
  const [showReconnect, setShowReconnect] = useState(false); 
  const [savedGameId, setSavedGameId] = useState(null); 
  const [savedUsername, setSavedUsername] = useState(null); 

  useEffect(() => {
    fetchLeaderboard();

    // Check for saved game in localStorage
    const storedGameId = localStorage.getItem('activeGameId');
    const storedUsername = localStorage.getItem('activeUsername');
    if (storedGameId && storedUsername) {
      setSavedGameId(storedGameId);
      setSavedUsername(storedUsername);
      setShowReconnect(true);
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('waiting_for_opponent', (data) => {
      setStatus('⏳ Waiting for opponent... (Bot will join in 10s)');
    });

socket.on('game_started', (data) => {
  setGameState(data.game);
  setBoard(data.game.board);
  setPlayerColor(data.color);

  // Define myPlayerNumber first
  const myPlayerNumber = data.playerNumber;
  const myPlayerId = myPlayerNumber === 1 ? data.game.player1Id : data.game.player2Id;
  
  localStorage.setItem('myPlayerNumber', myPlayerNumber);
  localStorage.setItem('myPlayerId', myPlayerId);
  localStorage.setItem('activeGameId', data.game.id);
  localStorage.setItem('activeUsername', username);
  setIsMyTurn(data.playerNumber === 1);
  setWinningCells([]);
  setShowReconnect(false);
  const opponentText = data.opponent ? `Playing vs ${data.opponent}` : 'Waiting...';
  setStatus(` Game started! You are ${data.color}. ${opponentText}`);
});

    socket.on('move_made', (data) => {
      setBoard(data.board);
      const myPlayerNumber = parseInt(localStorage.getItem('myPlayerNumber'));
      let isMyTurnNow = false;
      if (data.nextTurn === 'bot') {
        isMyTurnNow = false;
      } else if (gameState) {
        if (myPlayerNumber === 1) {
          isMyTurnNow = data.nextTurn === gameState.player1Id;
        } else {
          isMyTurnNow = data.nextTurn === gameState.player2Id;
        }
      }
      setIsMyTurn(isMyTurnNow);
      setStatus(`${data.color === playerColor ? 'Your' : 'Opponent'} move at column ${data.column + 1}`);
    });

    // Handle reconnection success
    socket.on('game_reconnected', (data) => {
      setGameState(data.game);
      setBoard(data.game.board);
      const myPlayerNumber = data.playerNumber;
      localStorage.setItem('myPlayerNumber', myPlayerNumber);
      setPlayerColor(myPlayerNumber === 1 ? 'red' : 'yellow');
      setIsMyTurn(data.game.currentTurn === (myPlayerNumber === 1 ? data.game.player1Id : data.game.player2Id));
      setWinningCells([]);
      setShowReconnect(false);
      setStatus('🔄 Reconnected! Game resumed.');
      setSavedGameId(null);
  setSavedUsername(null);
    });
    
  socket.on('opponent_reconnected', (data) => {
    setStatus(`✅ ${data.message}`);
  });

    socket.on('game_ended', (data) => {
      setBoard(data.board);
      setIsMyTurn(false);
      setWinningCells(data.winningCells || []);
  const myPlayerNumber = parseInt(localStorage.getItem('myPlayerNumber'));

      // Clear saved game on end
      localStorage.removeItem('activeGameId');
      localStorage.removeItem('activeUsername');
      localStorage.removeItem('myPlayerNumber');
      setShowReconnect(false);

      let resultMessage = '';
      if (data.forfeited) {
                resultMessage = '🎉 Opponent disconnected. You win by forfeit!';

      } else if (data.winType === 'draw') {
        resultMessage = '🤝 Game ended in a draw!';
      } else if (data.winner === 'bot') {
        resultMessage = '🤖 Bot wins!';
      } else {
        const iWon = data.winner === socket.id;
    resultMessage = iWon ? '🎉 You win!' : '😢 You lose!';
      }

      setStatus(`${resultMessage} - Duration: ${data.duration}s`);
      fetchLeaderboard();
    });
// Add this in useEffect with other socket.on listeners
socket.on('reconnect_failed', (data) => {
  setStatus(`❌ ${data.message}`);
  setShowReconnect(false);
  localStorage.removeItem('activeGameId');
  localStorage.removeItem('activeUsername');
  localStorage.removeItem('myPlayerNumber');
});
    socket.on('error', (error) => {
      setStatus(`❌ Error: ${error.message}`);
    });

    return () => {
      socket.off('waiting_for_opponent');
      socket.off('game_started');
      socket.off('move_made');
      socket.off('game_ended');
      socket.off('game_reconnected');
      socket.off('opponent_reconnected');
      socket.off('reconnect_failed');
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

  
  const connectSocket = () => {
    return new Promise((resolve) => {
      const newSocket = io(SOCKET_URL);
      setSocket(newSocket);
      newSocket.on('connect', () => {
        resolve(newSocket);
      });
    });
  };

  
  const handleReconnect = async () => {
    const newSocket = await connectSocket();
    setStatus('Trying to reconnect...');
      const storedPlayerId = localStorage.getItem('myPlayerId'); // ✅ Get stored player ID

    newSocket.emit('reconnect_game', {
      username: savedUsername,
      gameId: savedGameId,
      playerId: storedPlayerId
    });

  //  If reconnect fails after 30 seconds, start new game
    // setTimeout(() => {
    //   if (!gameState) {
    //     setStatus(' Could not reconnect. Game was forfeited.');
    //     localStorage.removeItem('activeGameId');
    //     localStorage.removeItem('activeUsername');
    //     localStorage.removeItem('myPlayerNumber');
    //     setShowReconnect(false);
    //   }
    // }, 30000);
  };

  //  Handle skip reconnect - start new game
  const handleSkipReconnect = () => {
    localStorage.removeItem('activeGameId');
    localStorage.removeItem('activeUsername');
    localStorage.removeItem('myPlayerNumber');
    setShowReconnect(false);
  };

  const handleJoinGame = async () => {
    if (!username.trim()) {
      setStatus(' Please enter a username');
      return;
    }

    const newSocket = await connectSocket();
    setStatus(' Connected to server');
    newSocket.emit('join_game', { username: username.trim() });
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
    localStorage.removeItem('activeGameId');
    localStorage.removeItem('activeUsername');
    localStorage.removeItem('myPlayerNumber');
    setShowReconnect(false);
  };

  const isWinningCell = (row, col) => {
    return winningCells.some(cell => cell.row === row && cell.col === col);
  };

  return (
    <div className="App">
      <h1>🎮 4 in a Row</h1>

      {/* ✅ Reconnect Banner */}
      {showReconnect && !gameState && (
        <div className="reconnect-banner">
          <p>🔄 You have an active game as <strong>{savedUsername}</strong>. Do you want to rejoin?</p>
          <div className="reconnect-buttons">
            <button onClick={handleReconnect} className="reconnect-btn">Rejoin Game</button>
            <button onClick={handleSkipReconnect} className="skip-btn">Start New Game</button>
          </div>
        </div>
      )}

      {/* Join Section */}
      {!gameState && !showReconnect && (
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
      )}

      
      {gameState && (
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