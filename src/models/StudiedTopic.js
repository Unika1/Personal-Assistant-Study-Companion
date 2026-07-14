const mongoose = require('mongoose');

// This model records that ONE student studied ONE topic at some moment.
// A row is saved when:
//   - the student asks the Study page to explain a topic (source: 'study')
//   - the student asks a study question in chat, e.g. "explain recursion"
//     (source: 'chat')
//
// The Quiz page reads the newest rows here to show the "quiz on what you
// just studied" buttons. We save this on the server instead of only in
// localStorage so the list is not lost when the student logs in from a
// different device. The language choice is saved the same way.
const studiedTopicSchema = new mongoose.Schema(
  {
    // Which student studied the topic. Linked to the User model.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The topic that was studied, e.g. "recursion" or "sql joins".
    // Lowercased and trimmed so "Recursion" and "recursion" count as one
    // topic, matching how the Performance model stores quiz topics.
    topic: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Where the topic was studied: the Study page or the chat.
    source: {
      type: String,
      required: true,
      enum: ['study', 'chat'],
    },

    // When it was studied. Used to order the "recently studied" list.
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Match the other models: drop the internal __v version field.
    versionKey: false,
  }
);

const StudiedTopic = mongoose.model('StudiedTopic', studiedTopicSchema);

module.exports = StudiedTopic;
