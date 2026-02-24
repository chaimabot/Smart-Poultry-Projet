const bcrypt = require("bcryptjs");

const newPassword = "admin123";
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(newPassword, salt);

console.log("Nouveau hash pour 'admin123':");
console.log(hash);
