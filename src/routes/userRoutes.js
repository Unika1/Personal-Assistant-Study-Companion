// backend/src/routes/userRoutes.js
// API endpoints for user operations
// Routes connect URLs to controller functions

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  signup,
  login,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getProfile,
} = require('../controllers/userController');


// AUTH ROUTES

// POST signup: http://localhost:5000/api/users/signup
router.post('/signup', signup);

// POST login: http://localhost:5000/api/users/login
router.post('/login', login);


// GET profile: http://localhost:5000/api/users/profile
// This route needs a valid login token.
router.get('/profile', authMiddleware, getProfile);


// GET ROUTES

// GET all users: http://localhost:5000/api/users
router.get('/', getAllUsers);

// GET user by ID: http://localhost:5000/api/users/:id
router.get('/:id', getUserById);


// POST ROUTE (Create)

// POST new user: http://localhost:5000/api/users
// Body: { name, email, password, institution, degree }
router.post('/', createUser);


// PUT ROUTE (Update)

// PUT update user: http://localhost:5000/api/users/:id
// Body: { fields to update }
router.put('/:id', updateUser);


// DELETE ROUTE

// DELETE user: http://localhost:5000/api/users/:id
router.delete('/:id', deleteUser);

module.exports = router;
