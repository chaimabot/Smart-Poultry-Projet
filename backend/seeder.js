const mongoose = require('mongoose');
const Poulailler = require('./models/Poulailler');
const User = require('./models/User');

async function seedData() {
  await mongoose.connect('mongodb://localhost:27017/smartpoultry', { useNewUrlParser: true, useUnifiedTopology: true });

  // Create test user (admin@smartpoultry.com)
  const testUser = await User.findOne({ email: 'admin@smartpoultry.com' });
  if (!testUser) {
    const hashedPassword = 'your_hashed_password_here'; // Use bcrypt.hash('admin123', 12)
    await User.create({
      firstName: 'Admin',
      lastName: 'SmartPoultry',
      email: 'admin@smartpoultry.com',
      phone: '+33612345678',
      password: hashedPassword,
      isAdmin: true,
    });
    console.log('✅ Test user created');
  }

  // Create test poulailler
  const testPoulailler = await Poulailler.findOne({ name: 'Poulailler Test' });
  if (!testPoulailler) {
    await Poulailler.create({
      name: 'Poulailler Test',
      type: 'pondeuses',
      animalCount: 200,
      location: 'Zone A',
      owner: testUser?._id || new mongoose.Types.ObjectId(),
      status: 'connecte',
      thresholds: {
        temperatureMin: 20,
        temperatureMax: 28,
        humidityMin: 50,
        humidityMax: 70,
        co2Max: 1200,
        nh3Max: 20,
        dustMax: 100,
        waterLevelMin: 25,
      },
      actuatorStates: {
        door: { status: 'closed', mode: 'manual' },
        ventilation: { status: 'off', mode: 'auto' },
        lamp: { status: 'off', mode: 'auto' },
        pump: { status: 'off', mode: 'auto' },
      },
    });
    console.log('✅ Test poulailler created');
  }

  console.log('✅ Seeding complete! Login: admin@smartpoultry.com / admin123');
  process.exit(0);
}

seedData().catch(console.error);

