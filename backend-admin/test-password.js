const bcrypt = require("bcryptjs");

const hash = "$2b$10$PwiwHRzdkZew54yIVGoXhegb8fUthPJhFkOdTAPZU.4HAUwMMEFwu";

console.log("Testing password 'admin123':");
console.log("Match:", bcrypt.compareSync("admin123", hash));
