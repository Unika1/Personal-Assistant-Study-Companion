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
});

const User = mongoose.model('User', userSchema);

module.exports = User;
