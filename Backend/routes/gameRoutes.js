// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.post('/', gameController.createGame.bind(gameController));
router.get('/:gameId', gameController.getGame.bind(gameController));
router.get('/player/:username', gameController.getPlayerGames.bind(gameController));

module.exports = router;