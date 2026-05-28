const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Create a JWT for a user. This token is used to authenticate requests.
// The secret comes from the environment variable `JWT_SECRET`.
const createToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set in the environment');
  // Token expires in 7 days
  return jwt.sign({ userId: userId }, secret, { expiresIn: '7d' });
};

// Signup handler
// Expected body: { name, email, password }
// Returns 201 with user info and token on success.
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check which fields are missing and give a clear message.
    const missing = [];
    if (!name || String(name).trim() === '') missing.push('name');
    if (!email || String(email).trim() === '') missing.push('email');
    if (!password || String(password).trim() === '') missing.push('password');

    if (missing.length === 3) {
      return res.status(400).json({ message: 'Please fill all the form fields.' });
    }
    if (missing.length === 1) {
      return res.status(400).json({ message: `Please provide ${missing[0]}.` });
    }
    if (missing.length > 1) {
      return res.status(400).json({ message: `Please provide: ${missing.join(', ')}.` });
    }

    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({ name, email, password: hashedPassword });

    const token = createToken(user._id);

    // Set token as an HTTP-only cookie so JavaScript cannot read it
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({ message: 'Signup successful', token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    // Log the full error on the server for debugging, but do not send
    // internal error details to the client. Clients will receive a
    // generic message to avoid leaking sensitive info.
    console.error('Signup error:', error);
    return res.status(500).json({ message: 'Signup failed. Please try again.' });
  }
};

// Login handler
// Expected body: { email, password }
// Returns 200 with user info and token on success.
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const missing = [];
    if (!email || String(email).trim() === '') missing.push('email');
    if (!password || String(password).trim() === '') missing.push('password');

    if (missing.length === 2) {
      return res.status(400).json({ message: 'Please fill all the form fields.' });
    }
    if (missing.length === 1) {
      return res.status(400).json({ message: `Please provide ${missing[0]}.` });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password.' });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(400).json({ message: 'Invalid email or password.' });

    const token = createToken(user._id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({ message: 'Login successful', token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed. Please try again.' });
  }
};

module.exports = {
  signup,
  login,
};