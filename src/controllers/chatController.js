const { askPASC, isQuizRequest } = require('../services/aiService');
const { buildQuizContext, buildLearnerContext } = require('../services/performanceService');
const {
  extractStudiedTopicFromChat,
  recordStudiedTopic,
} = require('../services/topicHistoryService');
const Session = require('../models/Session');

// Turn the first student message into a short session title.
function createSessionTitle(message) {
  const words = String(message || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'New Session';
  }

  return words.slice(0, 6).join(' ');
}

// Convert the PASC reply into a value we can save in MongoDB.
function formatReplyForStorage(reply) {
  if (typeof reply === 'string') {
    return reply;
  }

  return JSON.stringify(reply);
}

// This function handles chat messages from the frontend.
const sendMessage = async (req, res) => {
  // Read the message, history, and optional session id from the request body.
  const { message, history, sessionId, language } = req.body;
  const userId = req.user && req.user.id;

  // Check if the message is missing or empty.
  if (!message || String(message).trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // If this looks like a quiz request, gather the student's performance so
    // PASC can adapt the question. For normal chat we skip this extra work
    // and behave exactly as before.
    let performanceContext = null;
    if (isQuizRequest(message)) {
      performanceContext = await buildQuizContext(userId, message);
    }

    // For normal (non-quiz) chat, build a light learner profile so PASC can
    // personalise the reply to the student's weak areas. Best-effort: if this
    // fails we still answer, just without personalisation.
    let learnerContext = null;
    if (!performanceContext) {
      try {
        learnerContext = await buildLearnerContext(userId);
      } catch (contextError) {
        learnerContext = null;
      }
    }

    // If this chat message clearly asks to learn a topic ("explain
    // recursion", "what is a linked list"), remember that topic so the Quiz
    // page can offer a quiz on it later. We skip quiz requests because
    // asking for a quiz is practice, not studying a new topic.
    // The topic is also sent back to the frontend so the chat can show a
    // "quiz me on this" shortcut right under the answer.
    let studiedTopic = '';
    if (!performanceContext) {
      studiedTopic = extractStudiedTopicFromChat(message);
      if (studiedTopic) {
        recordStudiedTopic(userId, studiedTopic, 'chat').catch(() => {});
      }
    }

    // Send the message, history, performance context (for quizzes) and learner
    // context (for normal chat) to PASC through askPASC.
    const aiText = await askPASC(message, history, performanceContext, language, learnerContext);

    // Find the existing session, or create a new one for the first message.
    let session = null;

    if (sessionId) {
      session = await Session.findOne({ _id: sessionId, userId });
    }

    if (!session) {
      session = await Session.create({
        userId,
        title: createSessionTitle(message),
        messages: [],
      });
    }

    // Save the student's question and PASC answer in the session.
    session.messages.push(
      {
        role: 'user',
        content: String(message).trim(),
      },
      {
        role: 'pasc',
        content: formatReplyForStorage(aiText),
      }
    );

    await session.save();

    // Return the AI response as JSON. studiedTopic is included (when one was
    // detected) so the frontend can offer a quiz shortcut on that topic.
    return res.json({
      response: aiText,
      sessionId: session._id,
      sessionTitle: session.title,
      studiedTopic: studiedTopic || undefined,
    });
  } catch (error) {
    // Log the real error on the server for debugging.
    console.error('Chat controller error:', error);

    // Return a simple message to the frontend.
    return res.status(500).json({ error: 'PASC could not respond' });
  }
};

module.exports = {
  sendMessage,
};
