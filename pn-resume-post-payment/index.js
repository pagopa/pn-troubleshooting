const { main } = require("./src/main");

async function run({
  args = process.argv.slice(2),
  env = process.env,
  logger = console,
  mainFunction = main,
} = {}) {
  try {
    const { exitCode } = await mainFunction({ args, env }, logger);
    return exitCode;
  } catch (error) {
    logger.error(JSON.stringify({
      event: "RESUME_POST_PAYMENT_SCRIPT_ERROR",
      error: error.message,
    }));
    return 1;
  }
}

if (require.main === module) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { run };
