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
      script: "node_modules/.bin/tsx",
      args: "scripts/answerStreamConsumer.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
