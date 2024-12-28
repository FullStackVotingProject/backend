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

// Public routes
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfileValidator, updateProfile);
router.put('/password', auth, updatePassword);

module.exports = router;
