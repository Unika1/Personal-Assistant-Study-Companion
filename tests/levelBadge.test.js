require('dotenv').config();

const { getLevelInfo, LEVELS } = require('../src/services/performanceService');

// These tests check the level badge rules. Levels are earned from total
// correct answers only, so the thresholds are the whole system: get them
// right and the badge is fair, get them wrong and students level up (or
// stay stuck) at the wrong times.

describe('level badge (getLevelInfo)', () => {
  test('a brand-new student starts at level 1, Beginner', () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.name).toBe('Beginner');
    expect(info.nextLevelAt).toBe(10);
  });

  test('levels change exactly at their thresholds', () => {
    expect(getLevelInfo(9).level).toBe(1);
    expect(getLevelInfo(10).level).toBe(2);
    expect(getLevelInfo(24).level).toBe(2);
    expect(getLevelInfo(25).level).toBe(3);
    expect(getLevelInfo(49).level).toBe(3);
    expect(getLevelInfo(50).level).toBe(4);
    expect(getLevelInfo(99).level).toBe(4);
    expect(getLevelInfo(100).level).toBe(5);
  });

  test('progress toward the next level is a value between 0 and 1', () => {
    // Halfway from level 1 (0 correct) to level 2 (10 correct).
    expect(getLevelInfo(5).progress).toBeCloseTo(0.5);
    // Just reached level 2: progress toward level 3 starts again.
    expect(getLevelInfo(10).progress).toBeCloseTo(0);
  });

  test('the top level has no next threshold and stays full', () => {
    const info = getLevelInfo(500);
    expect(info.level).toBe(5);
    expect(info.name).toBe('Master');
    expect(info.nextLevelAt).toBeNull();
    expect(info.progress).toBe(1);
  });

  test('bad input is treated as zero instead of breaking', () => {
    expect(getLevelInfo(undefined).level).toBe(1);
    expect(getLevelInfo(-5).level).toBe(1);
  });

  test('the ladder itself has five named levels in rising order', () => {
    expect(LEVELS).toHaveLength(5);
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i].minCorrect).toBeGreaterThan(LEVELS[i - 1].minCorrect);
    }
  });
});
