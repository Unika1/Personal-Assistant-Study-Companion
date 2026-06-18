const Performance = require('../models/Performance');
const { extractTopic } = require('./aiService');

// This service is the "brain" that reads a student's saved quiz attempts
// (the Performance records) and turns them into useful numbers:
//   - how accurate the student is on each topic
//   - a simple "mastery level" label for each topic
//   - which topics are "weak" and need more practice
//   - how hard the next question on a topic should be
//
// Keeping all of this maths in one service (instead of inside a controller)
// means the chat flow and the quiz flow can both reuse the same logic.

// A topic counts as "weak" when the student's accuracy is below this value.
// 0.6 means 60%. It is a named constant so it is easy to change in one place
// and easy to explain in the report ("we flag topics below 60% accuracy").
const WEAK_TOPIC_THRESHOLD = 0.6;

// We only trust a topic's accuracy once the student has answered at least
// this many questions on it. Without this, a single unlucky wrong answer
// would instantly label a topic as "weak" (1 wrong out of 1 = 0% accuracy),
// which would not be fair or useful.
const MINIMUM_ATTEMPTS_FOR_WEAK = 3;

// How many of the most recent attempts on a topic we look at when deciding
// the next difficulty. A small window keeps the system responsive to how
// the student is doing RIGHT NOW, not months ago.
const RECENT_WINDOW_SIZE = 3;

// Turn an accuracy number (0 to 1) into a simple, human-friendly label.
// Three bands keep it easy to explain and match the three difficulty rungs.
function getMasteryLevel(accuracy) {
  if (accuracy >= 0.8) {
    return 'strong';
  }
  if (accuracy >= 0.5) {
    return 'developing';
  }
  return 'beginner';
}

// Read every attempt for one student and summarise it per topic.
// Returns an array like:
//   [
//     { topic: 'pointers', total: 5, correct: 2, accuracy: 0.4,
//       mastery: 'beginner', isWeak: true },
//     ...
//   ]
async function getTopicStats(userId) {
  // Get all of this student's attempts, oldest first.
  const attempts = await Performance.find({ userId }).sort({ timestamp: 1 });

  // Group the attempts by topic using a plain object as a lookup table.
  const statsByTopic = {};

  attempts.forEach((attempt) => {
    const topic = attempt.topic;

    // First time we see this topic, set up its counters.
    if (!statsByTopic[topic]) {
      statsByTopic[topic] = { topic: topic, total: 0, correct: 0 };
    }

    // Count this attempt.
    statsByTopic[topic].total += 1;
    if (attempt.isCorrect) {
      statsByTopic[topic].correct += 1;
    }
  });

  // Convert the lookup table into an array and add the derived fields
  // (accuracy, mastery label, and the weak flag).
  const topicList = Object.values(statsByTopic).map((stat) => {
    const accuracy = stat.total > 0 ? stat.correct / stat.total : 0;

    const isWeak =
      stat.total >= MINIMUM_ATTEMPTS_FOR_WEAK &&
      accuracy < WEAK_TOPIC_THRESHOLD;

    return {
      topic: stat.topic,
      total: stat.total,
      correct: stat.correct,
      accuracy: accuracy,
      mastery: getMasteryLevel(accuracy),
      isWeak: isWeak,
    };
  });

  return topicList;
}

// Return only the weak topics for a student, weakest (lowest accuracy) first.
// The quiz generator uses this to decide what to ask about.
async function getWeakTopics(userId) {
  const topicList = await getTopicStats(userId);

  const weakTopics = topicList.filter((topic) => topic.isWeak);

  // Sort so the most-struggling topic is first.
  weakTopics.sort((a, b) => a.accuracy - b.accuracy);

  return weakTopics;
}

// Decide how hard the next question on a given topic should be, based on the
// student's RECENT attempts on that topic (a streak-aware difficulty ladder).
//
// Rules, kept simple so they are easy to justify:
//   - brand new topic (no attempts yet)        -> start at 'easy'
//   - last few answers were ALL correct         -> step up one level
//   - the most recent answer was wrong          -> step down one level
//   - otherwise                                 -> stay at the recent level
async function getCurrentDifficulty(userId, topic) {
  const ladder = ['easy', 'medium', 'hard'];

  // Look at the most recent attempts on this exact topic, newest first.
  const recentAttempts = await Performance.find({
    userId,
    topic: String(topic || '').trim().toLowerCase(),
  })
    .sort({ timestamp: -1 })
    .limit(RECENT_WINDOW_SIZE);

  // No history yet for this topic: begin gently.
  if (recentAttempts.length === 0) {
    return 'easy';
  }

  // The newest attempt tells us the level the student was last asked at.
  const lastAttempt = recentAttempts[0];
  let currentIndex = ladder.indexOf(lastAttempt.difficulty);
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  // If the most recent answer was wrong, make the next one easier.
  if (!lastAttempt.isCorrect) {
    const easierIndex = currentIndex - 1 < 0 ? 0 : currentIndex - 1;
    return ladder[easierIndex];
  }

  // The most recent answer was correct. Check for a winning streak:
  // only step up if the whole recent window was correct AND we actually
  // have a full window to judge by.
  const allRecentCorrect = recentAttempts.every(
    (attempt) => attempt.isCorrect
  );

  if (allRecentCorrect && recentAttempts.length === RECENT_WINDOW_SIZE) {
    const harderIndex =
      currentIndex + 1 > ladder.length - 1
        ? ladder.length - 1
        : currentIndex + 1;
    return ladder[harderIndex];
  }

  // Correct, but no full streak yet: stay at the current level.
  return ladder[currentIndex];
}

// Produce a single overall summary of a student's quiz performance.
// This is what the Progress dashboard shows at the top of the page:
// total questions answered, overall accuracy, how many topics they have
// studied, and how many of those are currently weak.
async function getOverallSummary(userId) {
  const topicList = await getTopicStats(userId);

  let totalAttempts = 0;
  let totalCorrect = 0;

  topicList.forEach((topic) => {
    totalAttempts += topic.total;
    totalCorrect += topic.correct;
  });

  const overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
  const weakTopicCount = topicList.filter((topic) => topic.isWeak).length;

  return {
    totalAttempts,
    totalCorrect,
    overallAccuracy,
    topicsStudied: topicList.length,
    weakTopicCount,
  };
}

// Work out everything the AI needs to generate ONE adaptive quiz question
// for a student: which topic to target and how hard to make it.
//
// This used to live inside the chat controller. It is now here so BOTH the
// chat flow and the dedicated quiz page can reuse exactly the same logic.
async function buildQuizContext(userId, message) {
  // Find the student's weak topics, weakest first (may be empty for new users).
  const weakTopics = await getWeakTopics(userId);

  // Try to read a specific topic out of the student's request,
  // e.g. "quiz me on pointers" -> "pointers".
  const requestedTopic = extractTopic(message);

  // Target the topic the student named, otherwise their weakest topic.
  // This may stay empty for a brand-new student with no history.
  let targetTopic = requestedTopic;
  if (!targetTopic && weakTopics.length > 0) {
    targetTopic = weakTopics[0].topic;
  }

  // Decide the difficulty for that topic (starts at 'easy' if unknown).
  let difficulty = 'easy';
  if (targetTopic) {
    difficulty = await getCurrentDifficulty(userId, targetTopic);
  }

  // Collect the questions this student was recently asked so the AI can avoid
  // repeating them. If we have a target topic we only look within that topic;
  // otherwise we look across all of their recent attempts.
  const recentQuery = { userId };
  if (targetTopic) {
    recentQuery.topic = targetTopic;
  }

  const recentAttempts = await Performance.find(recentQuery)
    .sort({ timestamp: -1 })
    .limit(8)
    .select('question');

  const recentQuestions = recentAttempts
    .map((attempt) => attempt.question)
    .filter(Boolean);

  return { topic: targetTopic, difficulty, weakTopics, recentQuestions };
}

// Build a small "learner profile" used to personalise normal chat replies and
// study explanations (NOT quizzes - those already use buildQuizContext).
//
// It answers two questions for the AI:
//   1. What is this student generally weak at?  -> weakTopics
//   2. If they asked about a specific topic, how are they doing on it?
//      -> topicStat (their accuracy + mastery on that exact topic, if any)
//
// Everything here is optional/best-effort: a brand-new student simply comes
// back with empty weakTopics and a null topicStat, and the prompts fall back
// to their normal, non-personalised wording.
async function buildLearnerContext(userId, topic) {
  const topicList = await getTopicStats(userId);

  const weakTopics = topicList
    .filter((item) => item.isWeak)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((item) => ({ topic: item.topic, accuracy: item.accuracy }));

  // If the student named/asked about a specific topic, find their stats on it.
  let topicStat = null;
  const wanted = String(topic || '').trim().toLowerCase();
  if (wanted) {
    topicStat = topicList.find((item) => item.topic === wanted) || null;
  }

  return { weakTopics, topicStat };
}

module.exports = {
  getTopicStats,
  getWeakTopics,
  buildLearnerContext,
  getCurrentDifficulty,
  getOverallSummary,
  buildQuizContext,
  // Exported so other code (and tests) can read the same constants/labels.
  getMasteryLevel,
  WEAK_TOPIC_THRESHOLD,
};
