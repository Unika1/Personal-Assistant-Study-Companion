const express = require('express');
const router = express.Router();
const { signup, login } = require('../controllers/authController');

// This route creates a new account.
router.post('/signup', signup);

// This route logs an existing user in.
router.post('/login', login);

module.exports = router;