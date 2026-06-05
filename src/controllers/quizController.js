const Performance = require('../models/Performance');
const { askPASC } = require('../services/aiService');
const {
  buildQuizContext,
  getTopicStats,
  getOverallSummary,
} = require('../services/performanceService');

// This controller handles a student SUBMITTING their answer to a quiz question.
//
// Why a separate route from /api/chat?
// When a quiz question is created it goes out through /api/chat as JSON
// (question, options, correct, explanation). But the student's CHOSEN answer
// never comes back to the server in any structured way. To record performance
// we need an explicit "here is my answer" step. This controller is that step.
//
// The frontend already holds the full quiz JSON it received, so when the
// student clicks an option it sends that JSON back plus the chosen letter.

// Decide how hard the NEXT question should be (the "difficulty ladder").
// Rule, kept deliberately simple so it is easy to explain:
//   - if the student just got it WRONG  -> step one level easier
//   - if the student just got it RIGHT  -> step one level harder
// The three rungs are easy -> medium -> hard.
function getNextDifficulty(currentDifficulty, isCorrect) {
  const ladder = ['easy', 'medium', 'hard'];

  // Find where the current question sits on the ladder.
  // If we somehow get an unknown value, treat it as 'easy' (index 0).
  let currentIndex = ladder.indexOf(currentDifficulty);
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  // Move up on a correct answer, down on a wrong one.
  let nextIndex = isCorrect ? currentIndex + 1 : currentIndex - 1;

  // Keep the index inside the ladder so we never fall off either end.
  if (nextIndex < 0) {
    nextIndex = 0;
  }
  if (nextIndex > ladder.length - 1) {
    nextIndex = ladder.length - 1;
  }

  return ladder[nextIndex];
}

// Handle POST /api/quiz/answer
// Expected body: { topic, question, options, correct, studentAnswer, difficulty }
// Returns: { isCorrect, correctAnswer, explanation, nextDifficulty }
const submitAnswer = async (req, res) => {
  // The auth middleware put the logged-in student's id here.
  const userId = req.user && req.user.id;

  // Read the answer details sent back by the frontend.
  const {
    topic,
    question,
    correct,
    studentAnswer,
    difficulty,
    explanation,
  } = req.body;

  // Make sure the student is logged in.
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Make sure we have the minimum fields needed to grade and record.
  if (!topic || !question || !correct || !studentAnswer) {
    return res.status(400).json({
      error: 'topic, question, correct and studentAnswer are all required',
    });
  }

  try {
    // Grade the answer. We compare letters in a case-insensitive way so
    // that "b" from the student still matches a stored "B".
    const isCorrect =
      String(studentAnswer).trim().toUpperCase() ===
      String(correct).trim().toUpperCase();

    // If the frontend did not send a difficulty, assume the easiest level.
    const questionDifficulty = difficulty || 'easy';

    // Save this attempt so future quizzes can adapt to the student.
    await Performance.create({
      userId,
      topic,
      question,
      studentAnswer,
      isCorrect,
      difficulty: questionDifficulty,
    });

    // Work out how hard the next question should be.
    const nextDifficulty = getNextDifficulty(questionDifficulty, isCorrect);

    // Tell the frontend the result so it can show feedback to the student.
    return res.json({
      isCorrect,
      correctAnswer: correct,
      explanation: explanation || '',
      nextDifficulty,
    });
  } catch (error) {
    // Log the real error for debugging, send a simple message to the client.
    console.error('Quiz controller error:', error);
    return res.status(500).json({ error: 'Could not save your answer' });
  }
};

// Handle POST /api/quiz/generate
// Expected body: { topic } (topic is optional)
// Returns: { quiz } where quiz is the adaptive multiple-choice question.
//
// This is what makes the Quiz page a SEPARATE feature from chat: the student
// asks for a question here and we build it using their performance history.
const generateQuiz = async (req, res) => {
  const userId = req.user && req.user.id;
  const { topic } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Turn the requested topic into a normal quiz request sentence so we can
    // reuse the same adaptive logic the chat flow uses. If no topic is given,
    // the context builder will fall back to the student's weakest topic.
    const message = topic ? `quiz me on ${topic}` : 'quiz me';

    // Read the student's performance to decide topic + difficulty.
    const performanceContext = await buildQuizContext(userId, message);

    // Ask PASC for one adaptive question (askPASC detects the quiz request).
    const quiz = await askPASC(message, [], performanceContext);

    return res.json({ quiz });
  } catch (error) {
    console.error('Quiz generate error:', error);
    return res.status(500).json({ error: 'Could not generate a quiz' });
  }
};

// Handle GET /api/quiz/stats
// Returns the student's performance summary and per-topic breakdown.
// This is the data source for the Progress dashboard page.
const getStats = async (req, res) => {
  const userId = req.user && req.user.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Per-topic accuracy / mastery / weak flag.
    const topics = await getTopicStats(userId);

    // Overall totals shown at the top of the dashboard.
    const summary = await getOverallSummary(userId);

    // Just the weak topics, weakest first, for the "focus areas" section.
    const weakTopics = topics
      .filter((topic) => topic.isWeak)
      .sort((a, b) => a.accuracy - b.accuracy);

    return res.json({ summary, topics, weakTopics });
  } catch (error) {
    console.error('Quiz stats error:', error);
    return res.status(500).json({ error: 'Could not load your progress' });
  }
};

module.exports = {
  submitAnswer,
  generateQuiz,
  getStats,
  // Exported so the AI service can reuse the same ladder rules later.
  getNextDifficulty,
};
