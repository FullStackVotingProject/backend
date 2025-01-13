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
                    
                    <p>Pour voir les résultats détaillés, cliquez sur le lien ci-dessous :</p>
                    <a href="${pollUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 4px; margin-top: 10px;">
                        Voir les résultats détaillés
                    </a>
                `
            };

            console.log('Sending email with options:', {
                to: email,
                subject: mailOptions.subject
            });

            await transporter.sendMail(mailOptions);
            console.log('Poll results email sent successfully to:', email);
        } catch (error) {
            console.error('Error sending poll results email:', error);
            throw error;
        }
    }
};

module.exports = emailService;
