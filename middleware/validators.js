const { body } = require('express-validator');

const registerValidator = [
    body('username')
        .trim()
        .isLength({ min: 3 })
        .withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email invalide'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Le mot de passe doit contenir au moins 6 caractères')
];

const loginValidator = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email invalide'),
    body('password')
        .exists()
        .withMessage('Mot de passe requis')
];

const updateProfileValidator = [
    body('username')
        .optional()
        .trim()
        .isLength({ min: 3 })
        .withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Email invalide'),
    body('currentPassword')
        .if(body('newPassword').exists())
        .exists()
        .withMessage('Mot de passe actuel requis pour changer le mot de passe'),
    body('newPassword')
        .optional()
        .isLength({ min: 6 })
        .withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
];

module.exports = {
    registerValidator,
    loginValidator,
    updateProfileValidator
};
