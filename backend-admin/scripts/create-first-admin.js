#!/usr/bin/env node

/**
 * 📋 FIRST ADMIN SETUP SCRIPT
 * Crée le premier administrateur du système
 *
 * Usage: node scripts/create-first-admin.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const readline = require("readline");
const bcrypt = require("bcryptjs");

dotenv.config();

const User = require("../models/User");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

async function createFirstAdmin() {
  try {
    console.log("\n╔════════════════════════════════════╗");
    console.log("║  🔐 FIRST ADMIN SETUP - CRITICAL   ║");
    console.log("╚════════════════════════════════════╝\n");

    // Connect to MongoDB
    console.log("[DB] Connecting to MongoDB...");
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/smart-poultry",
    );
    console.log("✅ Connected to MongoDB\n");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      console.warn("⚠️  WARNING: An admin user already exists!");
      console.warn(`   Email: ${existingAdmin.email}`);
      const proceed = await question(
        "\nDo you want to create another admin? (y/N): ",
      );
      if (proceed.toLowerCase() !== "y") {
        console.log("Cancelled.");
        process.exit(0);
      }
    }

    // Collect admin info
    console.log("📝 Enter admin details:\n");
    const firstName = await question("First Name: ");
    const lastName = await question("Last Name: ");
    const email = await question("Email: ");
    const password = await question("Password (minimum 8 characters): ");
    const phone = await question("Phone (optional): ");

    // Validation
    if (!firstName || !lastName || !email || !password) {
      console.error(
        "❌ Error: First name, last name, email, and password are required",
      );
      process.exit(1);
    }

    if (password.length < 8) {
      console.error("❌ Error: Password must be at least 8 characters");
      process.exit(1);
    }

    // Check email uniqueness
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`❌ Error: Email ${email} is already in use`);
      process.exit(1);
    }

    // Create admin
    console.log("\n⏳ Creating admin user...");
    const admin = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone: phone || null,
      role: "admin",
      isActive: true,
      status: "active",
    });

    console.log("\n📊 ADMIN CREATED SUCCESSFULLY!\n");
    console.log("═══════════════════════════════════════");
    console.log(`✅ Admin ID:     ${admin._id}`);
    console.log(`✅ Name:         ${admin.firstName} ${admin.lastName}`);
    console.log(`✅ Email:        ${admin.email}`);
    console.log(`✅ Role:         ${admin.role}`);
    console.log(`✅ Status:       ${admin.status}`);
    console.log("═══════════════════════════════════════\n");

    console.log("🔐 Next Steps:");
    console.log("1. Start backend admin: cd backend-admin && npm start");
    console.log("2. Login at http://localhost:5173 with:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: (the one you entered)`);
    console.log("3. Create more admins via dashboard\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run
createFirstAdmin();
