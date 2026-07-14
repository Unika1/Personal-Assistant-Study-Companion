const StudiedTopic = require('../models/StudiedTopic');

// This service remembers WHAT a student has recently studied, so the Quiz
// page can offer a quiz on exactly that (instead of a generic question).
//
// Two sources feed it:
//   - the Study page, where the student types the topic themselves
//   - the chat, where we try to detect study questions like
//     "explain recursion" using a small set of patterns

// How many recent topics the Quiz page shows as chips.
const RECENT_TOPICS_LIMIT = 5;

// Keep at most this many rows per student. Older rows are pruned on write so
// the collection cannot grow without bound.
const MAX_ROWS_PER_USER = 50;

// Phrases at the START of a chat message that show the student is asking to
// learn something. We only record a topic when the message starts with one of
// these, because saving a wrong topic would fill the "recently studied" list
// with junk. It is better to miss a topic than to save a wrong one.
const STUDY_PATTERNS = [
  /^(?:please\s+)?explain(?:\s+to\s+me)?\s+(.+)$/i,
  /^what\s+(?:is|are)\s+(.+)$/i,
  /^teach\s+me(?:\s+about)?\s+(.+)$/i,
  /^tell\s+me\s+about\s+(.+)$/i,
  /^help\s+me\s+(?:understand|learn|with)\s+(.+)$/i,
  /^how\s+(?:do|does)\s+(.+?)\s+work\??$/i,
  /^i\s+(?:want|need)\s+to\s+(?:learn|understand|study)(?:\s+about)?\s+(.+)$/i,
];

// Filler words trimmed off the edges of an extracted topic, so
// "explain the concept of recursion please" becomes just "recursion".
const EDGE_FILLER_WORDS = [
  'a', 'an', 'the', 'please', 'me', 'to', 'concept', 'of', 'about',
  'in', 'simple', 'terms', 'again', 'more', 'detail', 'basics',
];

// Try to pull a studied TOPIC out of a free-text chat message.
// Returns the topic string, or '' when the message does not clearly
// introduce one. It is kept strict on purpose: it only matches messages
// that fit a study pattern, and it rejects anything too long to be a
// topic name.
function extractStudiedTopicFromChat(message) {
  const text = String(message || '').trim();
  if (!text) {
    return '';
  }

  for (const pattern of STUDY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    // Clean the captured part: drop punctuation, split into words.
    let words = match[1]
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, ' ') // keep chars used in names like c++, c#, .net
      .split(/\s+/)
      .filter(Boolean);

    // Trim filler words from the front and back (but never from the middle,
    // so multi-word topics like "linked lists" survive intact).
    while (words.length > 0 && EDGE_FILLER_WORDS.includes(words[0])) {
      words.shift();
    }
    while (words.length > 0 && EDGE_FILLER_WORDS.includes(words[words.length - 1])) {
      words.pop();
    }

    // A real topic name is short. Anything longer is probably a full
    // question ("what is the difference between tcp and udp and when..."),
    // which we skip rather than record wrongly.
    if (words.length >= 1 && words.length <= 4) {
      return words.join(' ');
    }
  }

  return '';
}

// Save one "this student studied this topic" row, then delete old rows so
// each student keeps at most MAX_ROWS_PER_USER. The callers do not wait for
// this to finish and ignore errors from it, because a problem saving the
// topic should never break the chat or study reply the student asked for.
async function recordStudiedTopic(userId, topic, source) {
  const clean = String(topic || '').trim().toLowerCase();
  if (!userId || !clean) {
    return null;
  }

  const row = await StudiedTopic.create({ userId, topic: clean, source });

  // Prune: keep only the newest MAX_ROWS_PER_USER rows for this student.
  const excess = await StudiedTopic.find({ userId })
    .sort({ timestamp: -1 })
    .skip(MAX_ROWS_PER_USER)
    .select('_id');

  if (excess.length > 0) {
    await StudiedTopic.deleteMany({ _id: { $in: excess.map((doc) => doc._id) } });
  }

  return row;
}

// Return the student's most recently studied topics, newest first, with
// duplicates removed (studying "recursion" three times shows it once).
async function getRecentStudiedTopics(userId, limit = RECENT_TOPICS_LIMIT) {
  const rows = await StudiedTopic.find({ userId })
    .sort({ timestamp: -1 })
    .limit(MAX_ROWS_PER_USER)
    .select('topic');

  const seen = new Set();
  const topics = [];

  for (const row of rows) {
    if (!seen.has(row.topic)) {
      seen.add(row.topic);
      topics.push(row.topic);
    }
    if (topics.length >= limit) {
      break;
    }
  }

  return topics;
}

module.exports = {
  extractStudiedTopicFromChat,
  recordStudiedTopic,
  getRecentStudiedTopics,
  RECENT_TOPICS_LIMIT,
};
