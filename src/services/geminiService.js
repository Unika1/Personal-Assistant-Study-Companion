// Import the Groq SDK package.
const Groq = require('groq-sdk');

// Create a Groq client using the API key from the environment.
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


// GROQ_MODEL can override this without changing code.
const modelName = 'llama-3.3-70b-versatile';

// Check whether the student is asking for a quiz.
function isQuizRequest(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('quiz') || text.includes('test me') || text.includes('ask me questions') || text.includes('multiple choice');
}

// Try to pull a JSON object out of the model response.
function parseQuizJson(rawText) {
  const cleanedText = String(rawText || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '');

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    const startIndex = cleanedText.indexOf('{');
    const endIndex = cleanedText.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return JSON.parse(cleanedText.slice(startIndex, endIndex + 1));
    }

    throw error;
  }
}

// Ask Groq for one quiz question in JSON format.
async function askForQuiz(message, history) {
  const quizPrompt = `You are PASC, a friendly AI study companion for technology students in Kathmandu, Nepal.

Create exactly ONE multiple-choice quiz question based on the student's request.

Return ONLY valid JSON with this structure:
{
  "type": "quiz",
  "question": "What is an array?",
  "options": {
    "A": "A single variable",
    "B": "A collection of elements",
    "C": "A function",
    "D": "A loop"
  },
  "correct": "B",
  "explanation": "An array stores multiple values"
}

Rules:
- Return JSON only, with no markdown, no backticks, and no extra text.
- Make the question simple and beginner friendly.
- Keep the options clear and short.
- Make sure exactly one option is correct.
- The explanation should be short and helpful.`;

  const chatMessages = [{ role: 'system', content: quizPrompt }];

  if (Array.isArray(history) && history.length > 0) {
    history.forEach((previousMessage, index) => {
      chatMessages.push({
        role: 'user',
        content: `Previous message ${index + 1}: ${previousMessage}`,
      });
    });
  }

  chatMessages.push({
    role: 'user',
    content: `Student request: ${message}`,
  });

  const result = await groq.chat.completions.create({
    model: modelName,
    messages: chatMessages,
    temperature: 0.4,
  });

  const rawText = result.choices?.[0]?.message?.content || '';
  const quizData = parseQuizJson(rawText);

  return {
    type: 'quiz',
    question: String(quizData.question || '').trim(),
    options: quizData.options || {},
    correct: String(quizData.correct || '').trim(),
    explanation: String(quizData.explanation || '').trim(),
  };
}

// Ask PASC a question and return the AI text response.
const askPASC = async (message, history = []) => {
  if (isQuizRequest(message)) {
    return askForQuiz(message, history);
  }

  // Keep the exact PASC system prompt requested for the thesis project.
  const systemPrompt = `You are PASC, a friendly AI study companion 
for technology students in Kathmandu, Nepal. 

STRICT RULES:
- You ONLY help with technology, programming, 
  computer science, mathematics, and academic 
  study topics
- If a student asks about anything outside 
  these topics (fashion, food, movies, sports, 
  relationships, entertainment etc.) politely 
  refuse like this:
  'I am PASC, your study companion for tech 
  topics! I can only help you with programming, 
  computer science, and academic subjects. 
  Try asking me about arrays, functions, 
  databases, or any tech topic! 😊'
- Never generate a quiz for non-tech topics
- Never answer personal questions
- Always bring conversation back to studying

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
