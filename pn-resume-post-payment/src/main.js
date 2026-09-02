const path = require("path");
const { createSqsClient } = require("./aws-client");
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
  clientFactory = createSqsClient,
}) {
  const resumeType = resolveResumeType(args);
  const awsEnvironment = resolveAwsEnvironment(env);
  const csvPath = resolveCsvPath(resumeType, scriptDirectory);

  await assertReadableFile(csvPath, access);

  return {
    resumeType,
    csvPath,
    queueUrl: awsEnvironment.queueUrl,
    sqsClient: clientFactory(awsEnvironment),
  };
}

async function main(options) {
  const execution = await prepareExecution(options);
  console.log(JSON.stringify({
    event: "RESUME_POST_PAYMENT_SCRIPT_READY",
    resumeType: execution.resumeType,
    csvPath: execution.csvPath,
  }));

  return { exitCode: 0, execution };
}

module.exports = {
  main,
  prepareExecution,
};
