const groq= require('../services/aiService');

// Handle POST /api/ai/study
// Expects JSON body: { topic: string, level?: string }
// Returns: { result: string }
const generateStudy = async (req, res) => {
  const { topic, level } = req.body;
  if (!topic) return res.status(400).json({ message: 'Please provide a topic in the request body.' });

  try {
    const output = await gemini.generateStudyMaterial(topic, level || 'beginner');
    return res.json({ result: output });
  } catch (err) {
    console.error('AI generateStudy error:', err.message || err);
    return res.status(500).json({ message: 'Could not generate study material right now.' });
  }
};

// Handle POST /api/ai/quiz
// Expects JSON body: { topic: string, count?: number }
// Returns: { result: string }
const generateQuiz = async (req, res) => {
  const { topic, count } = req.body;
  if (!topic) return res.status(400).json({ message: 'Please provide a topic in the request body.' });

  try {
    const output = await gemini.generateQuiz(topic, count || 5);
    return res.json({ result: output });
  } catch (err) {
    console.error('AI generateQuiz error:', err.message || err);
    return res.status(500).json({ message: 'Could not generate quiz right now.' });
  }
};

// Handle POST /api/ai/ask
// Expects JSON body: { question: string, context?: string }
// Returns: { result: string }
const askQuestion = async (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ message: 'Please provide a question in the request body.' });

  try {
    const output = await gemini.answerQuestion(question, context || '');
    return res.json({ result: output });
  } catch (err) {
    console.error('AI askQuestion error:', err.message || err);
    return res.status(500).json({ message: 'Could not answer the question right now.' });
  }
};

// Handle POST /api/ai/plan
// Expects JSON body: { topics: string[], duration?: string }
// Returns: { result: string }
const createPlan = async (req, res) => {
  const { topics, duration } = req.body;
  if (!topics || !Array.isArray(topics) || topics.length === 0) return res.status(400).json({ message: 'Please provide an array of topics in the request body.' });

  try {
    const output = await gemini.createStudyPlan(topics, duration || '1 month');
    return res.json({ result: output });
  } catch (err) {
    console.error('AI createPlan error:', err.message || err);
    return res.status(500).json({ message: 'Could not create study plan right now.' });
  }
};

module.exports = {
  generateStudy,
  generateQuiz,
  askQuestion,
  createPlan,
};
