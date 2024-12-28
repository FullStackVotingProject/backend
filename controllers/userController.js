const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Send verification email
const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `http://localhost:3000/verify-email/${token}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Vérifiez votre adresse email',
        html: `
            <h1>Bienvenue sur notre plateforme de vote !</h1>
            <p>Pour activer votre compte, veuillez cliquer sur le lien ci-dessous :</p>
            <a href="${verificationUrl}">Vérifier mon email</a>
            <p>Ce lien expirera dans 24 heures.</p>
            <p>Si vous n'avez pas créé de compte, vous pouvez ignorer cet email.</p>
        `
    };

    await transporter.sendMail(mailOptions);
};

// Register new user
const register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password } = req.body;

        // Check if user exists
        const [existingUsers] = await db.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            if (existingUser.isVerified) {
                return res.status(400).json({
                    message: 'Un utilisateur avec cet email ou ce nom d\'utilisateur existe déjà'
                });
            } else {
                // User exists but not verified, generate new verification token
                const verificationToken = crypto.randomBytes(32).toString('hex');
                const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

                await db.query(
                    'UPDATE users SET verificationToken = ?, verificationExpires = ? WHERE id = ?',
                    [verificationToken, verificationExpires, existingUser.id]
                );

                // Send new verification email
                await sendVerificationEmail(existingUser.email, verificationToken);

                return res.status(200).json({
                    message: 'Un nouveau lien de vérification a été envoyé à votre adresse email. Veuillez noter que vous devez attendre 5 minutes avant de pouvoir demander un autre lien.'
                });
            }
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const currentTime = new Date();

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user with verification token and explicitly set isVerified to false
        const [result] = await db.query(
            'INSERT INTO users (username, email, password, verificationToken, verificationExpires, isVerified, lastEmailSent) VALUES (?, ?, ?, ?, ?, 0, ?)',
            [username, email, hashedPassword, verificationToken, verificationExpires, currentTime]
        );

        // Send verification email
        await sendVerificationEmail(email, verificationToken);

        res.status(201).json({
            message: 'Compte créé avec succès. Un email de vérification a été envoyé. Veuillez noter que vous devez attendre 5 minutes avant de pouvoir demander un nouveau lien de vérification.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Verify email
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        // First check if the token exists and is not expired
        const [users] = await db.query(
            'SELECT * FROM users WHERE verificationToken = ? AND verificationExpires > NOW()',
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({
                message: 'Le lien de vérification est invalide ou a expiré'
            });
        }

        const user = users[0];

        if (user.isVerified) {
            return res.json({
                message: 'Votre compte est déjà vérifié. Vous pouvez vous connecter.',
                status: 'already_verified'
            });
        }

        // If not verified, proceed with verification
        await db.query(
            'UPDATE users SET isVerified = 1, verificationToken = NULL WHERE id = ?',
            [user.id]
        );

        res.json({
            message: 'Email vérifié avec succès. Vous pouvez maintenant vous connecter.',
            status: 'verified'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            message: 'Une erreur est survenue lors de la vérification',
            status: 'error'
        });
    }
};

// Login user
const login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                message: 'Données de connexion invalides',
                errors: errors.array() 
            });
        }

        const { email, password } = req.body;
        console.log('Login attempt for email:', email); // Debug log

        // Find user by email
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        console.log('Found users:', users.length); // Debug log

        if (users.length === 0) {
            return res.status(401).json({
                message: 'Email ou mot de passe incorrect'
            });
        }

        const user = users[0];
        console.log('User found:', { id: user.id, email: user.email, role: user.role, isVerified: user.isVerified }); // Debug log

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(401).json({
                message: 'Veuillez vérifier votre email avant de vous connecter'
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password valid:', validPassword); // Debug log

        if (!validPassword) {
            return res.status(401).json({
                message: 'Email ou mot de passe incorrect'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id,
                role: user.role || 'user' // Default to 'user' if role is not set
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role || 'user'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            message: 'Une erreur est survenue lors de la connexion'
        });
    }
};

// Resend verification email
const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;

        // Check if user exists and is not verified
        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({
                message: 'Aucun compte trouvé avec cet email'
            });
        }

        const user = users[0];

        if (user.isVerified) {
            return res.status(400).json({
                message: 'Ce compte est déjà vérifié'
            });
        }

        // Check cooldown using lastEmailSent
        if (user.lastEmailSent) {
            const lastSentTime = new Date(user.lastEmailSent);
            const currentTime = new Date();
            const timeDifference = (currentTime - lastSentTime) / 1000 / 60; // Convert to minutes

            if (timeDifference < 5) {
                const remainingTime = Math.ceil(5 - timeDifference);
                return res.status(429).json({
                    message: `Veuillez attendre ${remainingTime} minute${remainingTime > 1 ? 's' : ''} avant de demander un nouveau lien`
                });
            }
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const currentTime = new Date();

        // Update verification token and last email sent time
        await db.query(
            'UPDATE users SET verificationToken = ?, verificationExpires = ?, lastEmailSent = ? WHERE id = ?',
            [verificationToken, verificationExpires, currentTime, user.id]
        );

        // Send verification email
        await sendVerificationEmail(email, verificationToken);

        res.json({
            message: 'Un nouveau lien de vérification a été envoyé à votre adresse email. Veuillez noter que vous devez attendre 5 minutes avant de pouvoir demander un autre lien.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Une erreur est survenue lors de l\'envoi de l\'email de vérification'
        });
    }
};

// Get user profile
const getProfile = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, username, email, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Update user profile
const updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, currentPassword, newPassword } = req.body;

        // Get current user data
        const [users] = await db.query(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        const user = users[0];

        // If changing password, verify current password
        if (newPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({
                    message: 'Mot de passe actuel incorrect'
                });
            }
        }

        // Prepare update data
        const updates = {};
        if (username) updates.username = username;
        if (email) updates.email = email;
        if (newPassword) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(newPassword, salt);
        }

        // If no updates, return current profile
        if (Object.keys(updates).length === 0) {
            return res.json({
                message: 'Aucune modification effectuée',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at
                }
            });
        }

        // Update user
        const updateQuery = 'UPDATE users SET ? WHERE id = ?';
        await db.query(updateQuery, [updates, req.user.id]);

        res.json({
            message: 'Profil mis à jour avec succès',
            user: {
                id: user.id,
                username: updates.username || user.username,
                email: updates.email || user.email,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Update password
const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user's current password
        const [rows] = await db.query(
            'SELECT password FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        await db.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    register,
    login,
    getProfile,
    updateProfile,
    verifyEmail,
    resendVerification,
    updatePassword
};
