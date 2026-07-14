const {
  extractStudiedTopicFromChat,
} = require('../src/services/topicHistoryService');

// These tests cover the chat topic detector: the function that turns a chat
// message like "explain recursion" into a recorded studied topic. The
// detector is kept strict on purpose, because saving a wrong topic is worse
// than missing one. So the tests check two things: it finds the topic in
// clear study questions, and it returns nothing for everything else.

describe('extractStudiedTopicFromChat', () => {
  test('extracts the topic from "explain ..." messages', () => {
    expect(extractStudiedTopicFromChat('explain recursion')).toBe('recursion');
    expect(extractStudiedTopicFromChat('Please explain the concept of binary search')).toBe(
      'binary search'
    );
    expect(extractStudiedTopicFromChat('explain to me pointers')).toBe('pointers');
  });

  test('extracts the topic from "what is/are ..." questions', () => {
    expect(extractStudiedTopicFromChat('What is a linked list?')).toBe('linked list');
    expect(extractStudiedTopicFromChat('what are stacks')).toBe('stacks');
  });

  test('extracts the topic from other study phrasings', () => {
    expect(extractStudiedTopicFromChat('teach me about SQL joins')).toBe('sql joins');
    expect(extractStudiedTopicFromChat('help me understand pointers')).toBe('pointers');
    expect(extractStudiedTopicFromChat('tell me about the OSI model')).toBe('osi model');
    expect(extractStudiedTopicFromChat('how does garbage collection work?')).toBe(
      'garbage collection'
    );
    expect(extractStudiedTopicFromChat('i want to learn about recursion')).toBe('recursion');
  });

  test('returns empty for messages that are not study questions', () => {
    expect(extractStudiedTopicFromChat('thanks, that helps a lot!')).toBe('');
    expect(extractStudiedTopicFromChat('quiz me on arrays')).toBe('');
    expect(extractStudiedTopicFromChat('hello')).toBe('');
    expect(extractStudiedTopicFromChat('')).toBe('');
    expect(extractStudiedTopicFromChat(null)).toBe('');
  });

  test('rejects captures too long to be a topic name', () => {
    // This is a full question, not a topic name, so it should be skipped.
    expect(
      extractStudiedTopicFromChat(
        'what is the difference between tcp and udp and when should i use each one'
      )
    ).toBe('');
  });

  test('keeps characters used in real tech names', () => {
    expect(extractStudiedTopicFromChat('what is c++')).toBe('c++');
    expect(extractStudiedTopicFromChat('explain big-o notation')).toBe('big-o notation');
  });
});
