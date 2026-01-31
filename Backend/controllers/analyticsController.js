// controllers/analyticsController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AnalyticsController {
  async getAnalytics(req, res) {
    try {
      // Average game duration
      const avgDuration = await prisma.game.aggregate({
        where: { status: 'completed' },
        _avg: { duration: true }
      });

      // Most frequent winners
      const winners = await prisma.game.groupBy({
        by: ['winner'],
        where: {
          status: 'completed',
          winner: { not: 'bot' }
        },
        _count: { winner: true },
        orderBy: { _count: { winner: 'desc' } },
        take: 10
      });

      // Games per hour (last 24 hours)
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const gamesPerHour = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('hour', "startedAt") as hour,
          COUNT(*) as count
        FROM "Game"
        WHERE "startedAt" >= ${last24Hours}
        GROUP BY hour
        ORDER BY hour DESC
      `;

      // Player-specific metrics
      const playerMetrics = await prisma.player.findMany({
        select: {
          username: true,
          gamesWon: true,
          gamesLost: true,
          gamesDrawn: true
        },
        orderBy: { gamesWon: 'desc' },
        take: 10
      });

      res.json({
        avgGameDuration: avgDuration._avg.duration || 0,
        topWinners: winners,
        gamesPerHour,
        topPlayers: playerMetrics
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }
}

module.exports = new AnalyticsController();