const express = require('express');
const Session = require('../models/Session');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/sessions
// Return all sessions for the logged-in student.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && req.user.id;

    const sessions = await Session.find({ userId })
      .sort({ createdAt: -1 })
      .select('title createdAt messages');

    return res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching sessions',
      error: error.message,
    });
  }
});

// GET /api/sessions/:id
// Return one session for the logged-in student.
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const { id } = req.params;

    const session = await Session.findOne({ _id: id, userId });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching session',
      error: error.message,
    });
  }
});

// DELETE /api/sessions/:id
// Delete one session for the logged-in student.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    const { id } = req.params;

    const deletedSession = await Session.findOneAndDelete({ _id: id, userId });

    if (!deletedSession) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error deleting session',
      error: error.message,
    });
  }
});

module.exports = router;