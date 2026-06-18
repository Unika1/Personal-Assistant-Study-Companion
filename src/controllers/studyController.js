const { generateExplanation } = require('../services/aiService');
const { buildLearnerContext } = require('../services/performanceService');

// This controller powers the dedicated Study page, where a student enters a
// topic and a difficulty level and gets back a clear AI explanation.
// It is separate from the chat flow so the Study page can stand on its own.

// Handle POST /api/study/explain
// Expected body: { topic, level }  (level is optional, defaults to beginner)
// Returns: { explanation: string }
const explainTopic = async (req, res) => {
  const userId = req.user && req.user.id;
  const { topic, level, language } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // A topic is required: we cannot explain nothing.
  if (!topic || String(topic).trim() === '') {
    return res.status(400).json({ error: 'A topic is required' });
  }

  try {
    // Build a light learner profile for THIS topic so the explanation depth and
    // examples adapt to how the student is doing on it. Best-effort only.
    let learnerContext = null;
    try {
      learnerContext = await buildLearnerContext(userId, topic);
    } catch (contextError) {
      learnerContext = null;
    }

    // Ask the AI service for the explanation text (defaults to beginner level).
    const explanation = await generateExplanation(topic, level || 'beginner', language, learnerContext);

    return res.json({ explanation });
  } catch (error) {
    console.error('Study explain error:', error);
    return res.status(500).json({ error: 'Could not generate the explanation' });
  }
};

module.exports = {
  explainTopic,
};
