
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const gameRouter = require('./routes/gameRoutes');
const leaderboardRouter = require('./routes/leaderboardRoutes');
const analyticsRouter = require('./routes/analyticsRoutes');
const { handleSocketConnection } = require('./controllers/socketController');
const kafkaProducer = require('./services/kafkaProducer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/games', gameRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/analytics', analyticsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  handleSocketConnection(socket, io);
});

const PORT = process.env.PORT || 5000;

//  Connect to Kafka before starting server
async function startServer() {
  await kafkaProducer.connect();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await kafkaProducer.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };