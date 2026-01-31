// controllers/leaderboardController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class LeaderboardController {
  async getLeaderboard(req, res) {
    try {
      const players = await prisma.player.findMany({
        orderBy: {
          gamesWon: 'desc'
        },
        take: 100,
        select: {
          username: true,
          gamesWon: true,
          gamesLost: true,
          gamesDrawn: true
        }
      });

      const leaderboard = players.map((player, index) => ({
        rank: index + 1,
        username: player.username,
        wins: player.gamesWon,
        losses: player.gamesLost,
        draws: player.gamesDrawn,
        totalGames: player.gamesWon + player.gamesLost + player.gamesDrawn,
        winRate: player.gamesWon + player.gamesLost > 0 
          ? ((player.gamesWon / (player.gamesWon + player.gamesLost)) * 100).toFixed(2)
          : 0
      }));

      res.json(leaderboard);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  }

  async getPlayerStats(req, res) {
    try {
      const { username } = req.params;

      const player = await prisma.player.findUnique({
        where: { username },
        select: {
          username: true,
          gamesWon: true,
          gamesLost: true,
          gamesDrawn: true,
          createdAt: true
        }
      });

      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const totalGames = player.gamesWon + player.gamesLost + player.gamesDrawn;
      const winRate = player.gamesWon + player.gamesLost > 0 
        ? ((player.gamesWon / (player.gamesWon + player.gamesLost)) * 100).toFixed(2)
        : 0;

      res.json({
        ...player,
        totalGames,
        winRate
      });
    } catch (error) {
      console.error('Get player stats error:', error);
      res.status(500).json({ error: 'Failed to get player stats' });
    }
  }
}

module.exports = new LeaderboardController();