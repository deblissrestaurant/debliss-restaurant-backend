// 
// backend/utils/generateToken.js
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: __dirname + "/../.env" }); // ✅ Load .env safely

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in .env file");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

module.exports = generateToken;
