const { askPASC } = require('../services/geminiService');
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
  const { message, history, sessionId } = req.body;
  const userId = req.user && req.user.id;

  // Check if the message is missing or empty.
  if (!message || String(message).trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Send the message and history to Gemini through askPASC.
    const aiText = await askPASC(message, history);

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

    // Return the AI response as JSON.
    return res.json({
      response: aiText,
      sessionId: session._id,
      sessionTitle: session.title,
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
