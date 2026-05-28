const express = require('express');
const { sendMessage } = require('../controllers/chatController');

// Create a router for chat requests.
const router = express.Router();

// This route receives a student message and sends it to PASC.
router.post('/', sendMessage);

module.exports = router;
