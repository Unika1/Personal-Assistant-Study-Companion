// Import the Groq SDK package.
const Groq = require('groq-sdk');

// Import the Google Gemini SDK. Gemini handles Nepali far better than Llama,
// which tends to drift into Hindi, so Nepali requests are routed to Gemini.
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Create a Groq client using the API key from the environment.
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


// GROQ_MODEL can override this without changing code.
const modelName = 'llama-3.3-70b-versatile';

// Create a Gemini client only if a key is configured. If GEMINI_API_KEY is
// missing we leave this null and quietly fall back to Groq for everything, so
// the app still works (just with weaker Nepali) until the key is added.
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Decide whether a language string means Nepali.
function isNepali(language) {
  const normalized = String(language || '').toLowerCase();
  return normalized === 'ne' || normalized === 'nepali' || normalized === 'np';
}

// Run a chat completion, choosing the best provider for the language.
// - Nepali  -> Gemini (if configured), which writes proper Nepali.
// - English -> Groq/Llama, which is fast and already working well.
// Both paths take the same {role, content} message array and return plain text,
// so the three callers below do not need to know which provider was used.
async function runChat({ messages, temperature, language }) {
  // Route Nepali to Gemini when we have a key for it.
  if (isNepali(language) && genAI) {
    // Gemini takes a single prompt, so flatten the role-tagged messages into
    // one text block (system instructions first, then the conversation).
    const prompt = messages
      .map((message) => {
        const role = message.role === 'system' ? 'INSTRUCTIONS' : message.role.toUpperCase();
        return `${role}:\n${message.content}`;
      })
      .join('\n\n');

    const model = genAI.getGenerativeModel({
      model: geminiModelName,
      generationConfig: typeof temperature === 'number' ? { temperature } : undefined,
    });

    const result = await model.generateContent(prompt);
    return result.response.text() || '';
  }

  // Default: Groq/Llama for English (and Nepali if no Gemini key is set).
  const result = await groq.chat.completions.create({
    model: modelName,
    messages,
    ...(typeof temperature === 'number' ? { temperature } : {}),
  });

  return result.choices?.[0]?.message?.content || '';
}

// Build a plain-English instruction telling the model which language to answer
// in. The student picks this in the UI (English or Nepali) and it is threaded
// through every prompt. Defaulting to English keeps the old behaviour intact.
//
// For Nepali we ask for Devanagari script but allow technical terms to stay in
// English, because tech students in Kathmandu study most concepts in English
// and forcing rare Nepali coinages would hurt clarity.
function languageInstruction(language) {
  const normalized = String(language || 'en').toLowerCase();

  if (normalized === 'ne' || normalized === 'nepali' || normalized === 'np') {
    return [
      'Respond entirely in the NEPALI language (नेपाली भाषा) of Nepal, using Devanagari script.',
      'CRITICAL: Write Nepali, NOT Hindi. They look similar but are different languages. Use Nepali words and grammar, not Hindi.',
      'Use Nepali verb endings and words such as: छ / छन् / हो / गर्नुहोस् / तपाईं / हुन्छ / सक्नुहुन्छ / राम्रो / बुझ्नुभयो.',
      'Do NOT use Hindi words such as: है / हैं / करें / आप / होता है / सकते हैं / अच्छा / समझे. If you write any of these, you are wrong.',
      'Use simple, clear, encouraging Nepali. Technical terms (array, pointer, function) may stay in English but explain them in Nepali.',
    ].join(' ');
  }

  return 'Respond in clear, simple English.';
}

// Turn a student's learner context (from performanceService.buildLearnerContext)
// into a short, plain-English note we can drop into the chat and explanation
// prompts. This is what personalises normal answers: PASC is told what the
// student is weak at, so it can explain more carefully and connect new ideas to
// the topics they struggle with. Returns '' for a brand-new student so their
// experience is unchanged until there is data to personalise with.
function buildPersonalNote(learnerContext) {
  const context = learnerContext || {};
  const weakTopics = Array.isArray(context.weakTopics) ? context.weakTopics : [];
  const topicStat = context.topicStat || null;
  const degree = String(context.degree || '').trim();

  const lines = [];

  // If we know the student's degree, ask for examples that fit it. Examples
  // from the student's own field of study are easier to relate to.
  if (degree) {
    lines.push(
      `This student is studying ${degree}. When you give examples or analogies, prefer ones relevant to that programme.`
    );
  }

  // If we know how they are doing on the exact topic they asked about, lead
  // with that - it is the most relevant signal.
  if (topicStat && typeof topicStat.accuracy === 'number') {
    const percent = Math.round(topicStat.accuracy * 100);
    if (topicStat.isWeak) {
      lines.push(
        `This student is struggling with ${topicStat.topic} (${percent}% accuracy so far). Explain it extra carefully, assume little prior knowledge, and use a simple worked example.`
      );
    } else {
      lines.push(
        `This student is doing well on ${topicStat.topic} (${percent}% accuracy). You can go a little deeper and challenge them.`
      );
    }
  }

  // Always make PASC aware of their general weak areas so it can relate new
  // explanations back to them where it makes sense.
  if (weakTopics.length > 0) {
    const names = weakTopics.map((item) => item.topic).slice(0, 4).join(', ');
    lines.push(
      `This student's known weak areas are: ${names}. Where it helps understanding, briefly connect your answer to these.`
    );
  }

  return lines.join(' ');
}

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
  const recentQuestions = Array.isArray(context.recentQuestions)
    ? context.recentQuestions
    : [];
  const degree = String(context.degree || '').trim();

  const lines = [];

  // If we know the student's degree, ask the model to set the question in
  // that field when it makes sense (but not to force it where it does not fit).
  if (degree) {
    lines.push(
      `This student is studying ${degree}. Where it fits naturally, set the question scenario in a context relevant to that programme.`
    );
  }

  // Describe what each difficulty level actually means, so the model produces
  // a genuinely harder or easier question (not just a different label).
  const difficultyMeaning = {
    easy: 'a basic recall or definition question that a beginner can answer',
    medium: 'an application question that needs real understanding, not just memory',
    hard: 'a challenging question involving analysis, edge cases, or reading a short code snippet',
  };
  lines.push(
    `Ask ${difficultyMeaning[difficulty] || difficultyMeaning.easy} (difficulty level: ${difficulty}).`
  );

  // Tell the model not to repeat questions the student was already asked.
  // This is what stops the same question appearing again and again.
  if (recentQuestions.length > 0) {
    const numbered = recentQuestions
      .map((question, index) => `(${index + 1}) ${question}`)
      .join(' ');
    lines.push(
      `Do NOT repeat or reword any of these already-asked questions: ${numbered}. Ask about a different idea within the topic.`
    );
  }

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
async function askForQuiz(message, history, performanceContext, language = 'en') {
  // Turn the student's performance into plain-English instructions.
  const adaptiveInstructions = buildAdaptiveInstructions(performanceContext);

  // Decide which language the question text should be written in.
  const languageRule = languageInstruction(language);

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

LANGUAGE INSTRUCTION:
${languageRule}
Write the "question", the option texts, and the "explanation" in that language. Keep the JSON keys, the option letters (A, B, C, D), and the "topic" and "difficulty" values in English.

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
- The explanation should be short and helpful.
- Never use the em dash character (—) anywhere in the question, options, or explanation. Use commas or full stops instead.`;

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

  // A higher temperature gives more variety between questions, which also
  // helps avoid the model repeating the same question every time.
  // Nepali quizzes are routed to Gemini inside runChat for correct Nepali.
  const rawText = await runChat({
    messages: chatMessages,
    temperature: 0.9,
    language,
  });

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

// Explain WHY the student's specific wrong answer is wrong.
//
// The normal quiz explanation is written before the student answers, so it
// can only say why the correct option is right. This function is called
// AFTER a wrong answer and is given the exact option the student chose, so
// the feedback can talk about what the student got confused about, not just
// repeat the correct answer.
//
// Returns plain text. If this call fails, the caller shows the normal
// explanation instead, so grading still works.
async function explainWrongAnswer({ topic, question, options, correct, studentAnswer, language = 'en' }) {
  const languageRule = languageInstruction(language);

  // Show the model all the options so it can reason about the wrong one.
  const optionLines = Object.entries(options || {})
    .map(([letter, text]) => `${letter}: ${text}`)
    .join('\n');

  const systemPrompt = `You are PASC, a friendly AI study companion for technology students in Kathmandu, Nepal.

A student just answered a quiz question WRONG. Your job is to correct their specific misconception, not to give a generic explanation.

LANGUAGE INSTRUCTION:
${languageRule}

Rules:
- First, briefly explain what choosing THEIR option suggests they misunderstood.
- Then explain why the correct option is right.
- Then add a short walk-through: numbered steps (2 to 4 steps) showing how to reason from the question to the correct answer, so the student can follow the thinking next time. Start this part with the line "Walk-through:".
- Be encouraging, never mocking.
- Plain text only: no markdown, no headings, no bullet points (numbered steps like "1." are fine).
- Never use the em dash character (—). Use commas or full stops instead.`;

  const userPrompt = `Topic: ${topic || 'general'}
Question: ${question}
Options:
${optionLines}
Correct answer: ${correct}
The student chose: ${studentAnswer}

Explain why the student's choice (${studentAnswer}) is wrong and why ${correct} is correct.`;

  const text = await runChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    language,
  });

  return String(text || '').trim();
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
const askPASC = async (message, history = [], performanceContext = null, language = 'en', learnerContext = null) => {
  if (isQuizRequest(message)) {
    return askForQuiz(message, history, performanceContext, language);
  }

  // Which language PASC should reply in for normal chat.
  const languageRule = languageInstruction(language);

  // A short note about the student's weak areas, used to personalise the reply.
  const personalNote = buildPersonalNote(learnerContext);

  // Keep the exact PASC system prompt requested for the thesis project.
  const systemPrompt = `You are PASC, a friendly AI study companion 
for technology students in Kathmandu, Nepal. 

STRICT RULES:
- You ONLY help with technology, programming,
  computer science, software, databases,
  networking, and the mathematics used directly
  in computing (e.g. algorithms, Big-O, discrete
  maths, logic).
- You do NOT help with general exams or
  standardized tests such as SAT, IELTS, GRE,
  TOEFL, or general school subjects (history,
  biology, English essays, general maths), even
  though they are "academic". These are OUT of
  scope.
- If a student asks about anything outside
  technology/computing (fashion, food, movies,
  sports, relationships, entertainment, SAT or
  other exams, non-tech subjects etc.) politely
  refuse like this:
  'I am PASC, your study companion for technology
  topics! I can only help with programming,
  computer science, and related technical
  subjects. Try asking me about arrays, functions,
  databases, or any tech topic! 😊'
- Never generate a quiz for non-tech topics
- Never answer personal questions
- Always bring conversation back to studying

Explain concepts simply and clearly.
Guide students to think before giving answers.
Do not ask "Want me to quiz you?" after every answer.
Only create or suggest a quiz when the student clearly asks for a quiz.
Never use the em dash character (—) in your replies. Use commas or full stops instead.

PERSONALISATION (about THIS student - use it to tailor your answer, but never read these notes aloud):
${personalNote || 'No performance data yet; answer normally.'}

LANGUAGE INSTRUCTION:
${languageRule}`;

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

  // Ask the right provider for a chat completion (Gemini for Nepali, Groq for
  // English) and return the assistant reply as plain text.
  return runChat({ messages: chatMessages, language });
};

// Generate a study EXPLANATION for one topic at a chosen difficulty level.
// This powers the dedicated Study page (separate from the chat flow). It does
// not return a quiz, just clear teaching text the student can read.
const generateExplanation = async (topic, level = 'beginner', language = 'en', learnerContext = null) => {
  // Which language the explanation should be written in.
  const languageRule = languageInstruction(language);

  // A short note about the student's weak areas, used to tailor the depth.
  const personalNote = buildPersonalNote(learnerContext);

  // The system prompt keeps PASC on-topic (tech study only) and asks for a
  // clear, structured explanation aimed at the chosen level.
  const systemPrompt = `You are PASC, a friendly AI study companion for technology students in Kathmandu, Nepal.

Explain the requested topic clearly for a ${level} level student.

PERSONALISATION (about THIS student - use it to tailor the depth and examples, but never read these notes aloud):
${personalNote || 'No performance data yet; explain at the requested level normally.'}

LANGUAGE INSTRUCTION:
${languageRule}
Keep the labels "Definition:", "Key Points:" and "Example:" in English, but write the content under them in the chosen language.

Only explain technology, programming, computer science, mathematics, or academic study topics. If the topic is not a study topic, politely refuse and ask for a tech topic instead.

Format your answer EXACTLY like this, using these labels on their own lines:

Definition:
<one or two clear sentences>

Key Points:
- <point one>
- <point two>
- <point three>

Example:
<a short, simple example>

Formatting rules:
- Use the labels "Definition:", "Key Points:" and "Example:" exactly as shown.
- Write list items as lines starting with "- ".
- Do NOT use markdown headings (#), bold stars (**), tables, or code fences.
- Keep the language simple and encouraging.
- Never use the em dash character (—). Use commas or full stops instead.`;

  return runChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Explain this topic: ${topic}` },
    ],
    language,
  });
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
  explainWrongAnswer,
};
