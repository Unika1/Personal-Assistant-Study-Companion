const mongoose = require('mongoose');

// This model records ONE quiz attempt by ONE student.
// Every time a student answers a quiz question, we save a row here.
// Later we read all of a student's rows to work out which topics they
// are weak in, and how hard the next question should be (the adaptive part).
const performanceSchema = new mongoose.Schema(
  {
    // Which student made this attempt. Linked to the User model.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The topic this question was about, e.g. "pointers" or "arrays".
    // We store it lowercased and trimmed so that "Pointers" and "pointers"
    // are grouped together when we calculate accuracy per topic.
    topic: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // The exact question text that was asked. Kept so we can show the
    // student their history and so the AI can avoid repeating questions.
    question: {
      type: String,
      required: true,
      trim: true,
    },

    // The option letter the student chose, e.g. "A", "B", "C" or "D".
    studentAnswer: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // True if the student's answer matched the correct option.
    // This is the single most important field for measuring performance.
    isCorrect: {
      type: Boolean,
      required: true,
    },

    // How hard this question was. We limit it to three fixed levels
    // (the "difficulty ladder") so the adaptive logic stays simple.
    difficulty: {
      type: String,
      required: true,
      enum: ['easy', 'medium', 'hard'],
      default: 'easy',
    },

    // When the attempt happened. Used to look at the MOST RECENT attempts
    // when deciding whether to make the next question harder or easier.
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Match the Session model: drop the internal __v version field.
    versionKey: false,
  }
);

const Performance = mongoose.model('Performance', performanceSchema);

module.exports = Performance;
