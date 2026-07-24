module.exports = {
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.js"],
  collectCoverageFrom: ["services/**/*.js", "!node_modules/**"],
  coveragePathIgnorePatterns: ["/node_modules/"],
  testTimeout: 30000,
  verbose: true,
};
