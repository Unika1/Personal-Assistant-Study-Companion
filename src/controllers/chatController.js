const { askPASC } = require('../services/geminiService');

// This function handles chat messages from the frontend.
const sendMessage = async (req, res) => {
  // Read the message and history from the request body.
  const { message, history } = req.body;

  // Check if the message is missing or empty.
  if (!message || String(message).trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Send the message and history to Gemini through askPASC.
    const aiText = await askPASC(message, history);

    // Return the AI response as JSON.
    return res.json({ response: aiText });
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
