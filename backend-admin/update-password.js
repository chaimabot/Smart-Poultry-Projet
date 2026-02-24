const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartpoultry';

async function updatePassword() {
  await mongoose.connect(MONGO_URI);
  
  const newPassword = "admin123";
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  
  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: "admin@smartpoultry.tn" },
    { $set: { password: hash } }
  );
  
  console.log("Mot de passe mis à jour:", result);
  
  // Verify
  const user = await mongoose.connection.db.collection('users').findOne({ email: "admin@smartpoultry.tn" });
  console.log("Nouveau hash:", user.password);
  console.log("Vérification:", bcrypt.compareSync(newPassword, user.password));
  
  await mongoose.disconnect();
}

updatePassword().catch(console.error);
