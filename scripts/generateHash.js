const bcrypt = require('bcryptjs');

async function generateHash() {
    const password = 'admin@2024';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('Hashed password:', hashedPassword);
}

generateHash();
