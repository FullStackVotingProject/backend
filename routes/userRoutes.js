const express = require('express');
const router = express.Router();
const {
    register,
    login,
    getProfile,
    updateProfile,
    verifyEmail,
    resendVerification,
    updatePassword
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const {
    registerValidator,
    loginValidator,
    updateProfileValidator
} = require('../middleware/validators');
const db = require('../config/db');

// Public routes
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfileValidator, updateProfile);
router.put('/password', auth, updatePassword);

// Admin routes
router.get('/all', auth, async (req, res) => {
    try {
        // Check if user is admin
        const [adminCheck] = await db.query(
            'SELECT role FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!adminCheck || adminCheck[0].role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized: Admin access required' });
        }

        // Get all users with their creation date
        const [users] = await db.query(
            'SELECT id, username, email, created_at, role FROM users ORDER BY created_at DESC'
        );

        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
