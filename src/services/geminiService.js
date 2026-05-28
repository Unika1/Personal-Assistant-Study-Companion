// Import the Groq SDK package.
const Groq = require('groq-sdk');

// Create a Groq client using the API key from the environment.
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Set the model name that PASC will use.
const modelName = 'llama3-8b-8192';

// Ask PASC a question and return the AI text response.
const askPASC = async (message, history = []) => {
  // Keep the exact PASC system prompt requested for the thesis project.
  const systemPrompt = `You are PASC, a friendly AI study companion 
for technology students in Kathmandu, Nepal. 
Explain concepts simply and clearly. 
Guide students to think before giving answers.
End every explanation with: 
Want me to quiz you on this topic?`;

  // Convert the previous messages into Groq chat messages.
  const chatMessages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add each previous message so Groq can see the conversation history.
  if (Array.isArray(history) && history.length > 0) {
    history.forEach((previousMessage, index) => {
      chatMessages.push({
        role: 'user',
        content: `Previous message ${index + 1}: ${previousMessage}`,
      });
    });
  }

  // Add the newest student message at the end of the conversation.
  chatMessages.push({
    role: 'user',
    content: `Student: ${message}`,
  });

  // Ask Groq for a chat completion.
  const result = await groq.chat.completions.create({
    model: modelName,
    messages: chatMessages,
  });

  // Return the first assistant reply as plain text.
  return result.choices?.[0]?.message?.content || '';
};

// Export only the function used by the chat controller.
module.exports = {
  askPASC,
};
