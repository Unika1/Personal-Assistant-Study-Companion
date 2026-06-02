const express = require('express');
const { sendMessage } = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

// Create a router for chat requests.
const router = express.Router();

// This route receives a student message and sends it to PASC.
router.post('/', authMiddleware, sendMessage);

module.exports = router;
