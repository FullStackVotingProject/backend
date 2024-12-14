const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const emailService = {
    async sendVerificationEmail(email, token) {
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
    }
};

module.exports = emailService;
