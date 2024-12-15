const bcrypt = require('bcryptjs');

async function generateHash() {
    const passwords = ['admin@2024', 'user@2024'];
    
    for (const password of passwords) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log(`Password "${password}" hashed:`, hashedPassword);
    }
}

generateHash();
