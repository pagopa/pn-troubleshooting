const fs = require("fs/promises");
const { constants } = require("fs");
const path = require("path");

const RESUME_TYPE_FILES = Object.freeze({
  FIRST_ATTEMPT: "FIRST_ATTEMPT.csv",
  SECOND_ATTEMPT: "SECOND_ATTEMPT.csv",
  SIMPLE_REGISTERED_LETTER: "SIMPLE_REGISTERED_LETTER.csv",
});

function resolveResumeType(args) {
  if (args.length !== 1) {
    throw new Error("Exactly one resumeType argument is required");
  }

  const [resumeType] = args;
  if (resumeType.startsWith("-")) {
    throw new Error("CLI options are not supported");
  }
  if (!Object.hasOwn(RESUME_TYPE_FILES, resumeType)) {
    throw new Error(`Unsupported resumeType: ${resumeType}`);
  }

  return resumeType;
}

function resolveCsvPath(resumeType, scriptDirectory = path.resolve(__dirname, "..")) {
  return path.join(scriptDirectory, "csv", RESUME_TYPE_FILES[resumeType]);
}

function resolveAwsEnvironment(env) {
  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION;
  if (!region || !/^[a-z]{2,4}(?:-[a-z0-9]+)+-\d+$/.test(region)) {
    throw new Error("AWS_REGION or AWS_DEFAULT_REGION is required and must be valid");
  }

  const queueUrl = env.PN_RESUME_POST_PAYMENT_QUEUE_URL;
  if (!isHttpUrl(queueUrl)) {
    throw new Error("PN_RESUME_POST_PAYMENT_QUEUE_URL is required and must be a valid HTTP(S) URL");
  }

  if (env.SQS_ENDPOINT_URL && !isHttpUrl(env.SQS_ENDPOINT_URL)) {
    throw new Error("SQS_ENDPOINT_URL must be a valid HTTP(S) URL");
  }

  return {
    region,
    queueUrl,
    profile: env.AWS_PROFILE,
    endpoint: env.SQS_ENDPOINT_URL,
  };
}

async function assertReadableFile(filePath, access = fs.access) {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    throw new Error(`CSV file does not exist or is not readable: ${filePath}`, { cause: error });
  }
}

function isHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.host);
  } catch {
    return false;
  }
}

module.exports = {
  RESUME_TYPE_FILES,
  assertReadableFile,
  resolveAwsEnvironment,
  resolveCsvPath,
  resolveResumeType,
};
