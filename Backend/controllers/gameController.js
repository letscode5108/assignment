// controllers/gameController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class GameController {
  async createGame(req, res) {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      // Find or create player
      let player = await prisma.player.findUnique({
        where: { username }
      });

      if (!player) {
        player = await prisma.player.create({
          data: { username }
        });
      }

      // Create new game
      const game = await prisma.game.create({
        data: {
          player1Id: player.id,
          board: this.createEmptyBoard(),
          currentTurn: player.id,
          status: 'waiting'
        },
        include: {
          player1: true
        }
      });

      res.json(game);
    } catch (error) {
      console.error('Create game error:', error);
      res.status(500).json({ error: 'Failed to create game' });
    }
  }

  async getGame(req, res) {
    try {
      const { gameId } = req.params;

      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: true,
          player2: true
        }
      });

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      res.json(game);
    } catch (error) {
      console.error('Get game error:', error);
      res.status(500).json({ error: 'Failed to get game' });
    }
  }

  async getPlayerGames(req, res) {
    try {
      const { username } = req.params;

      const player = await prisma.player.findUnique({
        where: { username }
      });

      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const games = await prisma.game.findMany({
        where: {
          OR: [
            { player1Id: player.id },
            { player2Id: player.id }
          ]
        },
        include: {
          player1: true,
          player2: true
        },
        orderBy: {
          startedAt: 'desc'
        },
        take: 20
      });

      res.json(games);
    } catch (error) {
      console.error('Get player games error:', error);
      res.status(500).json({ error: 'Failed to get player games' });
    }
  }

  createEmptyBoard() {
    return Array(6).fill(null).map(() => Array(7).fill(null));
  }
}

module.exports = new GameController();