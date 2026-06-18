const mongoose = require('mongoose');

// This model stores only the fields we need for signup and login.
const userSchema = new mongoose.Schema({
  // Keep this because authController validates and saves `name`.
  name: {
    type: String,
    required: true,
    trim: true,
  },

  // Separate first name field.
  firstName: {
    type: String,
    trim: true,
    default: '',
  },

  // Separate last name field.
  lastName: {
    type: String,
    trim: true,
    default: '',
  },

  // Email stays required for login.
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },

  // The school or college the student attends. Shown and edited on the
  // Account page. Optional so existing accounts stay valid.
  institution: {
    type: String,
    trim: true,
    default: '',
  },

  // The student's degree or programme. Also shown on the Account page.
  degree: {
    type: String,
    trim: true,
    default: '',
  },

  // The student's preferred language for PASC's replies ('en' or 'ne').
  // Stored on the account so the choice follows the student across devices,
  // not just in one browser's localStorage. Defaults to English.
  language: {
    type: String,
    enum: ['en', 'ne'],
    default: 'en',
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
