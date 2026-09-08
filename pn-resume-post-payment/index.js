const { main } = require("./src/main");

if (require.main === module) {
  main({ args: process.argv.slice(2) }, console)
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        event: "RESUME_POST_PAYMENT_SCRIPT_ERROR",
        error: error.message,
      }));
      process.exitCode = 1;
    });
}
