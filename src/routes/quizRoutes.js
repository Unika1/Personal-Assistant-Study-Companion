const express = require('express');
const {
  submitAnswer,
  generateQuiz,
  getStats,
} = require('../controllers/quizController');
const authMiddleware = require('../middleware/authMiddleware');

// Create a router for the quiz feature. All routes need a logged-in student.
const router = express.Router();

// Generate one adaptive quiz question (used by the Quiz page).
router.post('/generate', authMiddleware, generateQuiz);

// Receive the student's chosen answer, grade it, and save a Performance record.
router.post('/answer', authMiddleware, submitAnswer);

// Return the student's progress summary and per-topic stats (Progress page).
router.get('/stats', authMiddleware, getStats);

module.exports = router;
