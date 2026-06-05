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

// Build the extra "adaptive" instructions for the quiz prompt from the
// student's past performance. This is what makes the quiz personalised:
// before we ask Groq for a question, we tell it how hard to make it and
// which topic the student is struggling with.
//
// performanceContext looks like:
//   { topic: 'pointers', difficulty: 'medium', weakTopics: [ { topic, accuracy, ... } ] }
// It may be null/empty for a brand-new student, which we handle gently.
function buildAdaptiveInstructions(performanceContext) {
  const context = performanceContext || {};
  const targetTopic = context.topic || '';
  const difficulty = context.difficulty || 'easy';
  const weakTopics = Array.isArray(context.weakTopics) ? context.weakTopics : [];

  const lines = [];

  // Always tell the model the difficulty level to aim for.
  lines.push(`Ask a ${difficulty}-difficulty question.`);

  // If we have a topic to focus on, say so. If we also know the student's
  // accuracy on it, include that so the model understands their struggle
  // (this produces prompts like the thesis example:
  //  "this student is weak in pointers at 42% accuracy...").
  if (targetTopic) {
    const stat = weakTopics.find((item) => item.topic === targetTopic);
    if (stat) {
      const percent = Math.round(stat.accuracy * 100);
      lines.push(
        `This student is weak in ${targetTopic} at ${percent}% accuracy, so focus the question on ${targetTopic}.`
      );
    } else {
      lines.push(`Focus the question on the topic: ${targetTopic}.`);
    }
  } else if (weakTopics.length > 0) {
    // No specific topic, but we know their weak areas: list them.
    const names = weakTopics.map((item) => item.topic).join(', ');
    lines.push(
      `This student is weak in these topics: ${names}. Prefer a question on one of them.`
    );
  }

  return lines.join(' ');
}

// performanceContext carries the adaptive information (topic + difficulty +
// weak topics). When it is empty the quiz behaves like the old generic one.
async function askForQuiz(message, history, performanceContext) {
  // Turn the student's performance into plain-English instructions.
  const adaptiveInstructions = buildAdaptiveInstructions(performanceContext);

  // The difficulty we ASKED for. We treat this as authoritative and save it
  // on the Performance record later, so the difficulty ladder stays consistent
  // no matter what the model writes back.
  const requestedDifficulty =
    (performanceContext && performanceContext.difficulty) || 'easy';

  // The topic we are targeting. May be empty for a brand-new student who has
  // not named a topic and has no weak topics yet.
  const requestedTopic =
    (performanceContext && performanceContext.topic) || '';

  const quizPrompt = `You are PASC, a friendly AI study companion for technology students in Kathmandu, Nepal.

Create exactly ONE multiple-choice quiz question based on the student's request.

ADAPTIVE INSTRUCTIONS (based on this student's past performance):
${adaptiveInstructions}

Return ONLY valid JSON with this structure:
{
  "type": "quiz",
  "topic": "arrays",
  "difficulty": "easy",
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
- Follow the ADAPTIVE INSTRUCTIONS above for the topic and difficulty.
- Set the "topic" field to the single topic the question is about.
- Set the "difficulty" field to one of: easy, medium, hard.
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

  // Decide the final topic to report back. We prefer the topic WE targeted
  // (so records group consistently); if we had none, fall back to whatever
  // topic the model labelled the question with.
  const finalTopic = String(requestedTopic || quizData.topic || '')
    .trim()
    .toLowerCase();

  return {
    type: 'quiz',
    // topic and difficulty are included so the frontend can send them back
    // to /api/quiz/answer, which is how the attempt gets recorded.
    topic: finalTopic,
    difficulty: requestedDifficulty,
    question: String(quizData.question || '').trim(),
    options: quizData.options || {},
    correct: String(quizData.correct || '').trim(),
    explanation: String(quizData.explanation || '').trim(),
  };
}

// Pull a likely TOPIC out of a free-text quiz request.
// This is a simple keyword-based approach: we remove the common quiz trigger
// and filler words, and whatever meaningful words remain are treated as the
// topic. e.g. "quiz me on pointers" -> "pointers".
// It is intentionally simple. If it guesses wrong, the system still works:
// it just falls back to the student's recorded weak topics instead.
function extractTopic(message) {
  const stopWords = [
    'quiz', 'me', 'test', 'ask', 'question', 'questions', 'multiple', 'choice',
    'on', 'about', 'a', 'an', 'the', 'give', 'please', 'can', 'you', 'with',
    'some', 'of', 'for', 'my', 'i', 'want', 'need', 'do', 'take',
  ];

  const words = String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // remove punctuation
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !stopWords.includes(word));

  return words.join(' ').trim();
}

// Ask PASC a question and return the AI text response.
// performanceContext is optional. It is only used for quiz requests, where it
// carries the student's weak topics and target difficulty so the question can
// adapt. For normal chat it is ignored and the behaviour is unchanged.
const askPASC = async (message, history = [], performanceContext = null) => {
  if (isQuizRequest(message)) {
    return askForQuiz(message, history, performanceContext);
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
Do not ask "Want me to quiz you?" after every answer.
Only create or suggest a quiz when the student clearly asks for a quiz.`;

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

// Generate a study EXPLANATION for one topic at a chosen difficulty level.
// This powers the dedicated Study page (separate from the chat flow). It does
// not return a quiz, just clear teaching text the student can read.
const generateExplanation = async (topic, level = 'beginner') => {
  // The system prompt keeps PASC on-topic (tech study only) and asks for a
  // clear, structured explanation aimed at the chosen level.
  const systemPrompt = `You are PASC, a friendly AI study companion for technology students in Kathmandu, Nepal.

Explain the requested topic clearly for a ${level} level student.

Rules:
- Only explain technology, programming, computer science, mathematics, or academic study topics.
- If the topic is not a study topic, politely refuse and ask for a tech topic instead.
- Structure the explanation so it is easy to follow: a short definition, then key points, then a simple example.
- Keep the language simple and encouraging.`;

  const result = await groq.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Explain this topic: ${topic}` },
    ],
  });

  return result.choices?.[0]?.message?.content || '';
};

// Export the functions used by the chat controller.
// - askPASC: main entry point for a student message.
// - isQuizRequest: lets the controller know when to gather performance data.
// - extractTopic: lets the controller guess the topic from the message.
module.exports = {
  askPASC,
  isQuizRequest,
  extractTopic,
  generateExplanation,
};
