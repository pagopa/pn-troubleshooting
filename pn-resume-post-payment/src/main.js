const path = require("path");
const { createSqsClient } = require("./aws-client");
const { readCsvFile } = require("./csv-reader");
const { publishRecords } = require("./sqs-publisher");
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

async function main(options, logger = console, publisher = publishRecords) {
  const execution = await prepareExecution(options);
  execution.csv.malformedRows.forEach(({ line, error }) => {
    logger.error(JSON.stringify({
      event: "RESUME_POST_PAYMENT_MALFORMED_ROW",
      line,
      error,
    }));
  });

  const publication = await publisher({
    records: execution.csv.records,
    resumeType: execution.resumeType,
    queueUrl: execution.queueUrl,
    sqsClient: execution.sqsClient,
    logger,
  });

  const exitCode = publication.failedPublications > 0 ? 1 : 0;
  const summary = {
    event: "RESUME_POST_PAYMENT_SUMMARY",
    csvPath: execution.csvPath,
    resumeType: execution.resumeType,
    ...execution.csv.counters,
    ...publication,
    exitCode,
  };

  logger.log(JSON.stringify(summary));

  return { exitCode, execution, summary };
}

module.exports = {
  main,
  prepareExecution,
};
