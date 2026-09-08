const fs = require("fs/promises");
const { constants } = require("fs");
const path = require("path");

const RESUME_TYPE_FILES = Object.freeze({
  FIRST_ATTEMPT: "FIRST_ATTEMPT.csv",
  SECOND_ATTEMPT: "SECOND_ATTEMPT.csv",
  SIMPLE_REGISTERED_LETTER: "SIMPLE_REGISTERED_LETTER.csv",
});

function resolveResumeType(resumeType) {
  if (!resumeType) {
    throw new Error("Exactly one resumeType argument is required");
  }
  if (!Object.hasOwn(RESUME_TYPE_FILES, resumeType)) {
    throw new Error(`Unsupported resumeType: ${resumeType}`);
  }

  return resumeType;
}

function resolveCsvPath(resumeType, scriptDirectory = path.resolve(__dirname, "..")) {
  return path.join(scriptDirectory, "csv", RESUME_TYPE_FILES[resumeType]);
}

function resolveExecutionArguments(args) {
  const values = {};
  const optionNames = new Set([
    "--resume-type",
    "--region",
    "--queue-url",
    "--profile",
    "--endpoint",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!optionNames.has(argument)) {
      throw new Error(`Unsupported CLI option: ${argument}`);
    }
    if (values[argument]) {
      throw new Error(`CLI option must be specified only once: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`CLI option requires a value: ${argument}`);
    }
    values[argument] = value;
    index += 1;
  }

  return resolveAwsConfiguration({
    resumeType: values["--resume-type"],
    region: values["--region"],
    queueUrl: values["--queue-url"],
    profile: values["--profile"],
    endpoint: values["--endpoint"],
  });
}

function resolveAwsConfiguration({ resumeType, region, queueUrl, profile, endpoint }) {
  resolveResumeType(resumeType);
  if (!region || !/^[a-z]{2,4}(?:-[a-z0-9]+)+-\d+$/.test(region)) {
    throw new Error("--region is required and must be valid");
  }

  if (!isHttpUrl(queueUrl)) {
    throw new Error("--queue-url is required and must be a valid HTTP(S) URL");
  }

  if (!profile) {
    throw new Error("--profile is required");
  }

  if (endpoint && !isHttpUrl(endpoint)) {
    throw new Error("--endpoint must be a valid HTTP(S) URL");
  }

  return {
    resumeType,
    region,
    queueUrl,
    profile,
    endpoint,
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
  resolveAwsConfiguration,
  resolveCsvPath,
  resolveExecutionArguments,
  resolveResumeType,
};
