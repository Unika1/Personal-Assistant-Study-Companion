// The quiz controller pulls in the AI service, which reads API keys from the
// environment when it loads, so the .env file must be loaded first.
require('dotenv').config();

const { getNextDifficulty } = require('../src/controllers/quizController');
const { getMasteryLevel, WEAK_TOPIC_THRESHOLD } = require('../src/services/performanceService');

// These tests check the adaptive engine's core rules: the three-step
// difficulty ladder and the mastery bands. The rules are the "adaptive part"
// of PASC, so the thesis evaluation depends on them behaving exactly as the
// design says: one step up after a correct answer, one step down after a
// wrong one, and never falling off either end of the ladder.

describe('difficulty ladder (getNextDifficulty)', () => {
  test('steps up one level after a correct answer', () => {
    expect(getNextDifficulty('easy', true)).toBe('medium');
    expect(getNextDifficulty('medium', true)).toBe('hard');
  });

  test('steps down one level after a wrong answer', () => {
    expect(getNextDifficulty('hard', false)).toBe('medium');
    expect(getNextDifficulty('medium', false)).toBe('easy');
  });

  test('does not go above hard or below easy', () => {
    expect(getNextDifficulty('hard', true)).toBe('hard');
    expect(getNextDifficulty('easy', false)).toBe('easy');
  });

  test('treats an unknown difficulty value as easy', () => {
    expect(getNextDifficulty('impossible', true)).toBe('medium');
    expect(getNextDifficulty(undefined, false)).toBe('easy');
  });

  test('a simulated losing streak walks down to easy and stays there', () => {
    let level = 'hard';
    const walk = [];
    for (let i = 0; i < 4; i += 1) {
      level = getNextDifficulty(level, false);
      walk.push(level);
    }
    expect(walk).toEqual(['medium', 'easy', 'easy', 'easy']);
  });

  test('a simulated winning streak walks up to hard and stays there', () => {
    let level = 'easy';
    const walk = [];
    for (let i = 0; i < 4; i += 1) {
      level = getNextDifficulty(level, true);
      walk.push(level);
    }
    expect(walk).toEqual(['medium', 'hard', 'hard', 'hard']);
  });
});

describe('mastery bands (getMasteryLevel)', () => {
  test('80% and above is strong', () => {
    expect(getMasteryLevel(0.8)).toBe('strong');
    expect(getMasteryLevel(1)).toBe('strong');
  });

  test('50% up to 80% is developing', () => {
    expect(getMasteryLevel(0.5)).toBe('developing');
    expect(getMasteryLevel(0.79)).toBe('developing');
  });

  test('below 50% is beginner', () => {
    expect(getMasteryLevel(0.49)).toBe('beginner');
    expect(getMasteryLevel(0)).toBe('beginner');
  });

  test('the weak-topic threshold is 60% as documented in the thesis', () => {
    expect(WEAK_TOPIC_THRESHOLD).toBe(0.6);
  });
});
