// routes/leaderboardRoutes.js
const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');

router.get('/', leaderboardController.getLeaderboard.bind(leaderboardController));
router.get('/player/:username', leaderboardController.getPlayerStats.bind(leaderboardController));

module.exports = router;