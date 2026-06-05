const express = require('express');
const { explainTopic } = require('../controllers/studyController');
const authMiddleware = require('../middleware/authMiddleware');

// Create a router for the study (explanation) feature.
const router = express.Router();

// Generate a clear explanation for one topic. Protected so only logged-in
// students can use it.
router.post('/explain', authMiddleware, explainTopic);

module.exports = router;
