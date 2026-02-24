const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Poulailler = require('./models/Poulailler');

dotenv.config();

const verifyData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find();
        console.log('--- Utilisateurs ---');
        users.forEach(u => console.log(`${u.email} (id: ${u._id})`));

        const poulaillers = await Poulailler.find();
        console.log('--- Poulaillers ---');
        poulaillers.forEach(p => console.log(`${p.name} (owner: ${p.owner})`));

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyData();
