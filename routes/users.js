const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const auth = require('../middleware/auth');

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    const { username, email } = req.body;

    try {
        // Check if email is already taken
        const emailCheck = await db.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [email, req.user.id]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        // Update user profile
        const result = await db.query(
            'UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email',
            [username, email, req.user.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update password
router.put('/password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    try {
        // Get user's current password
        const user = await db.query(
            'SELECT password FROM users WHERE id = $1',
            [req.user.id]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        await db.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, req.user.id]
        );

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
