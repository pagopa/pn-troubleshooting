const path = require("path");
const { createSqsClient } = require("./aws-client");
const { readCsvFile } = require("./csv-reader");
const {
  assertReadableFile,
  resolveAwsEnvironment,
  resolveCsvPath,
  resolveResumeType,
} = require("./execution-config");

async function prepareExecution({
  args,
  env,
  scriptDirectory = path.resolve(__dirname, ".."),
  access,
  readFile,
  clientFactory = createSqsClient,
}) {
  const resumeType = resolveResumeType(args);
  const awsEnvironment = resolveAwsEnvironment(env);
  const csvPath = resolveCsvPath(resumeType, scriptDirectory);

  await assertReadableFile(csvPath, access);
  const csv = await readCsvFile(csvPath, readFile);

  return {
    resumeType,
    csvPath,
    csv,
    queueUrl: awsEnvironment.queueUrl,
    sqsClient: clientFactory(awsEnvironment),
  };
}

async function main(options, logger = console) {
  const execution = await prepareExecution(options);
  execution.csv.malformedRows.forEach(({ line, error }) => {
    logger.error(JSON.stringify({
      event: "RESUME_POST_PAYMENT_MALFORMED_ROW",
      line,
      error,
    }));
  });

  logger.log(JSON.stringify({
    event: "RESUME_POST_PAYMENT_SCRIPT_READY",
    resumeType: execution.resumeType,
    csvPath: execution.csvPath,
    counters: execution.csv.counters,
  }));

  return { exitCode: 0, execution };
}

module.exports = {
  main,
  prepareExecution,
};
