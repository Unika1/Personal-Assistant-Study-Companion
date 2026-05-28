const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/authMiddleware');

// Protect all AI routes - only authenticated users may call these endpoints.
router.use(auth);

// AI endpoints. Each endpoint expects a JSON body and returns { result: string }.
// Example: POST /api/ai/study with { topic: 'React hooks' }
router.post('/study', aiController.generateStudy);

// Example: POST /api/ai/quiz with { topic: 'JavaScript', count: 5 }
router.post('/quiz', aiController.generateQuiz);

// Example: POST /api/ai/ask with { question: 'What is closure?', context: '' }
router.post('/ask', aiController.askQuestion);

// Example: POST /api/ai/plan with { topics: ['HTML','CSS'], duration: '2 weeks' }
router.post('/plan', aiController.createPlan);

module.exports = router;
