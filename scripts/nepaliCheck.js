// Nepali output quality check for PASC.
// Runs real AI calls with language 'ne' and analyses each output:
//   - share of Devanagari characters (is it even written in Devanagari?)
//   - Nepali grammar markers found (छ, छन्, हुन्छ, गर्नुहोस्, ...)
//   - Hindi contamination markers found (है, हैं, करें, आप, ...)
// Run from the backend folder: node <path-to-this-file>

require('dotenv').config();

const { askPASC, generateExplanation } = require('./src/services/aiService');

// Words that indicate proper NEPALI grammar.
const NEPALI_MARKERS = [
  'छ', 'छन्', 'हो', 'हुन्छ', 'गर्नुहोस्', 'तपाईं', 'सक्नुहुन्छ',
  'राम्रो', 'भनेको', 'गरिन्छ', 'हुन्', 'गर्छ', 'भने', 'लागि',
];

// Words that indicate HINDI leaking in (wrong language).
const HINDI_MARKERS = [
  'है', 'हैं', 'करें', 'आप', 'होता', 'सकते', 'सकता', 'अच्छा',
  'समझे', 'करते', 'करता', 'लिए', 'हूँ', 'चाहिए',
];

// Split into Devanagari word tokens and count marker hits.
function countMarkers(text, markers) {
  const tokens = String(text)
    .split(/[\s,।.?!:;()\[\]{}"'\-\/]+/)
    .filter(Boolean);
  const hits = {};
  for (const token of tokens) {
    if (markers.includes(token)) {
      hits[token] = (hits[token] || 0) + 1;
    }
  }
  return hits;
}

function analyse(label, text) {
  const full = String(text || '');
  const devanagari = (full.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (full.match(/[a-zA-Z]/g) || []).length;
  const letters = devanagari + latin;

  const nepaliHits = countMarkers(full, NEPALI_MARKERS);
  const hindiHits = countMarkers(full, HINDI_MARKERS);

  const nepaliCount = Object.values(nepaliHits).reduce((a, b) => a + b, 0);
  const hindiCount = Object.values(hindiHits).reduce((a, b) => a + b, 0);

  console.log('='.repeat(70));
  console.log(`TEST: ${label}`);
  console.log('-'.repeat(70));
  console.log(full.slice(0, 900));
  if (full.length > 900) console.log(`... [${full.length - 900} more chars]`);
  console.log('-'.repeat(70));
  console.log(
    `Devanagari share: ${letters ? Math.round((devanagari / letters) * 100) : 0}%` +
      ` (${devanagari} Devanagari vs ${latin} Latin letters)`
  );
  console.log(`Nepali markers (${nepaliCount}):`, JSON.stringify(nepaliHits));
  console.log(`Hindi markers  (${hindiCount}):`, JSON.stringify(hindiHits));

  let verdict = 'NEPALI OK';
  if (letters === 0 || devanagari / Math.max(letters, 1) < 0.3) {
    verdict = 'NOT ENOUGH DEVANAGARI (mostly English?)';
  } else if (hindiCount > nepaliCount) {
    verdict = 'LOOKS LIKE HINDI, NOT NEPALI';
  } else if (hindiCount > 0) {
    verdict = 'MOSTLY NEPALI, SOME HINDI WORDS';
  }
  console.log(`VERDICT: ${verdict}`);
  console.log('');

  return { label, devanagariShare: letters ? devanagari / letters : 0, nepaliCount, hindiCount, verdict };
}

async function main() {
  const results = [];

  // 1 + 2: normal chat questions in study style.
  const chatQuestions = ['explain recursion', 'what is a linked list?'];
  for (const q of chatQuestions) {
    try {
      const reply = await askPASC(q, [], null, 'ne', null);
      results.push(analyse(`chat: "${q}"`, reply));
    } catch (error) {
      console.log(`FAILED chat "${q}":`, error.message);
      results.push({ label: `chat: "${q}"`, verdict: `ERROR: ${error.message}` });
    }
  }

  // 3: a quiz question (goes through the JSON quiz path).
  try {
    const quiz = await askPASC(
      'quiz me on arrays',
      [],
      { topic: 'arrays', difficulty: 'easy', weakTopics: [], recentQuestions: [] },
      'ne'
    );
    const quizText = [
      quiz.question,
      ...Object.values(quiz.options || {}),
      quiz.explanation,
    ].join('\n');
    results.push(analyse('quiz on arrays (question + options + explanation)', quizText));
  } catch (error) {
    console.log('FAILED quiz:', error.message);
    results.push({ label: 'quiz on arrays', verdict: `ERROR: ${error.message}` });
  }

  // 4: a Study page explanation.
  try {
    const explanation = await generateExplanation('pointers', 'beginner', 'ne', null);
    results.push(analyse('study explanation: pointers (beginner)', explanation));
  } catch (error) {
    console.log('FAILED explanation:', error.message);
    results.push({ label: 'study explanation', verdict: `ERROR: ${error.message}` });
  }

  console.log('='.repeat(70));
  console.log('SUMMARY');
  for (const r of results) {
    console.log(`- ${r.label}: ${r.verdict}`);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
