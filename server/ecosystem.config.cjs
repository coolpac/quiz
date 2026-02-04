module.exports = {
  apps: [
    {
      name: "quiz-api",
      cwd: __dirname,
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "quiz-consumer",
      cwd: __dirname,
      script: "dist/consumer.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
