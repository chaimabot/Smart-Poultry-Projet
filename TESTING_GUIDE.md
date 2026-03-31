# 🧪 Testing Guide - Smart Poultry

## Setup Testing Environment

### Backend Éleveur

```bash
cd backend
npm install
```

**Create test admin user:**

```bash
node -e "
const User = require('./models/User');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI);

User.create({
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: 'password123',
  phone: '+33612345678',
  role: 'eleveur'
}).then(user => {
  console.log('✅ Test user created:', user._id);
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
"
```

### Backend Admin

```bash
cd backend-admin
npm install
```

**Create first admin user:**

```bash
node -e "
const User = require('./models/User');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI);

User.create({
  firstName: 'Admin',
  lastName: 'Super',
  email: 'admin@smartpoultry.com',
  password: 'AdminPass123!',
  phone: '+33612345678',
  role: 'admin',
  isActive: true
}).then(user => {
  console.log('✅ Admin user created:', user._id);
  console.log('   Email: admin@smartpoultry.com');
  console.log('   Password: AdminPass123!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
"
```

### Mobile

```bash
cd mobile
npm install
npx expo install expo-secure-store

# Start dev server
npx expo start

# On device/emulator: Scan QR or press 'i' (iOS) / 'a' (Android)
```

**Test credentials:**

- Email: `test@example.com`
- Password: `password123`

### Web Admin

```bash
cd web
npm install
npm run dev

# Open http://localhost:5173
```

**Test credentials:**

- Email: `admin@smartpoultry.com`
- Password: `AdminPass123!`

## Running Tests

### API Integration Tests

```bash
# Backend éleveur
cd backend
npm test

# Backend admin
cd backend-admin
npm test
```

### ESP32 Tests

Upload to device via PlatformIO:

```bash
cd Embarquee
pio run --target upload
pio device monitor  # View serial output
```

Monitor logs:

- Temperature
- Humidity
- MQ-135 readings
- MQTT connections
- Actuator states

## Debugging

### Backend Logs

```bash
# Enable debug mode
DEBUG=* npm start

# Specific component
DEBUG=mqtt,auth npm start
```

### Mobile Logs

```bash
# React Native console
npx expo start
# Press 'j' to open debugger
```

### Web Browser Console

Open DevTools (F12) → Console tab

## Performance Testing

### Load Testing Backend

```bash
# Using Apache Bench
ab -n 100 -c 10 http://localhost:5000/api/poulaillers

# Using Artillery
npm install -g artillery
artillery quick --count 100 --num 10 http://localhost:5000/api/poulaillers
```

## MongoDB Cleanup

Reset database:

```bash
# Delete all collections
mongo
use smart-poultry
db.dropDatabase()
```

Re-seed with test data:

```bash
# Run seed script if available
npm run seed
```

## Documentation

- API: `/docs/api.md`
- Architecture: `/docs/architecture-diagramme-composants.md`
- Deployment: `/docs/deployment.md`

## Notes

- ⚠️ Never commit test files with sensitive data
- Always use `.env.test` for test configuration
- Clean up test data after each test run
