const { expect } = require("chai");
const path = require("path");
const {
  RESUME_TYPE_FILES,
  assertReadableFile,
  resolveAwsConfiguration,
  resolveCsvPath,
  resolveExecutionArguments,
  resolveResumeType,
} = require("../src/execution-config");

describe("execution config", () => {
  describe("resolveResumeType", () => {
    Object.keys(RESUME_TYPE_FILES).forEach((resumeType) => {
      it(`accepts ${resumeType}`, () => {
        expect(resolveResumeType(resumeType)).to.equal(resumeType);
      });
    });

    it("rejects a missing argument", () => {
      expect(() => resolveResumeType()).to.throw("Exactly one resumeType");
    });

    it("rejects unsupported values", () => {
      expect(() => resolveResumeType(["UNKNOWN"]))
        .to.throw("Unsupported resumeType: UNKNOWN");
    });
  });

  it("maps resume types relative to the script directory", () => {
    const scriptDirectory = path.join("tmp", "script");

    expect(resolveCsvPath("SECOND_ATTEMPT", scriptDirectory)).to.equal(
      path.join(scriptDirectory, "csv", "SECOND_ATTEMPT.csv")
    );
  });

  Object.entries(RESUME_TYPE_FILES).forEach(([resumeType, fileName]) => {
    it(`maps ${resumeType} to csv/${fileName}`, () => {
      const scriptDirectory = path.join("tmp", "script");

      expect(resolveCsvPath(resumeType, scriptDirectory)).to.equal(
        path.join(scriptDirectory, "csv", fileName)
      );
    });
  });

  it("resolves the default CSV directory independently from cwd", () => {
    const originalCwd = process.cwd();

    process.chdir("/tmp");
    try {
      expect(resolveCsvPath("FIRST_ATTEMPT")).to.equal(
        path.resolve(__dirname, "..", "csv", "FIRST_ATTEMPT.csv")
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  describe("resolveExecutionArguments", () => {
    const requiredArguments = [
      "--resume-type", "FIRST_ATTEMPT",
      "--envName", "dev",
      "--queue-url", "https://sqs.eu-south-1.amazonaws.com/123/queue",
    ];

    it("accepts required options in any order", () => {
      expect(resolveExecutionArguments([
        "--queue-url", "https://sqs.eu-south-1.amazonaws.com/123/queue",
        "--envName", "dev",
        "--resume-type", "FIRST_ATTEMPT",
      ])).to.deep.equal({
        resumeType: "FIRST_ATTEMPT",
        envName: "dev",
        queueUrl: "https://sqs.eu-south-1.amazonaws.com/123/queue",
      });
    });

    it("rejects missing, positional and duplicate resume types", () => {
      expect(() => resolveExecutionArguments(requiredArguments.slice(2)))
        .to.throw("Exactly one resumeType");
      expect(() => resolveExecutionArguments([...requiredArguments, "SECOND_ATTEMPT"]))
        .to.throw("Unsupported CLI option: SECOND_ATTEMPT");
      expect(() => resolveExecutionArguments([...requiredArguments, "--resume-type", "SECOND_ATTEMPT"]))
        .to.throw("CLI option must be specified only once: --resume-type");
    });

    it("rejects unknown, duplicate and valueless options", () => {
      expect(() => resolveExecutionArguments([...requiredArguments, "--unknown", "value"]))
        .to.throw("Unsupported CLI option: --unknown");
      expect(() => resolveExecutionArguments([...requiredArguments, "--envName", "uat"]))
        .to.throw("CLI option must be specified only once: --envName");
      expect(() => resolveExecutionArguments(["--resume-type", "FIRST_ATTEMPT", "--envName", "--queue-url", "url"]))
        .to.throw("CLI option requires a value: --envName");
    });

    it("rejects invalid required AWS options", () => {
      expect(() => resolveExecutionArguments(["--resume-type", "FIRST_ATTEMPT", "--queue-url", "https://sqs.example/queue"]))
        .to.throw("--envName is required");
      expect(() => resolveExecutionArguments(["--resume-type", "FIRST_ATTEMPT", "--envName", "dev"]))
        .to.throw("--queue-url is required");
      expect(() => resolveExecutionArguments(["--resume-type", "FIRST_ATTEMPT", "--envName", "dev", "--queue-url", "not-a-url"]))
        .to.throw("--queue-url is required");
    });

    it("rejects legacy AWS options", () => {
      ["--profile", "--region", "--endpoint"].forEach((option) => {
        expect(() => resolveExecutionArguments([...requiredArguments, option, "value"]))
          .to.throw(`Unsupported CLI option: ${option}`);
      });
    });
  });

  describe("resolveAwsConfiguration", () => {
    const requiredConfiguration = {
      resumeType: "FIRST_ATTEMPT",
      envName: "dev",
      queueUrl: "https://sqs.eu-south-1.amazonaws.com/123/queue",
    };

    it("returns the common wrapper configuration", () => {
      expect(resolveAwsConfiguration(requiredConfiguration)).to.deep.equal({
        resumeType: "FIRST_ATTEMPT",
        envName: "dev",
        queueUrl: requiredConfiguration.queueUrl,
      });
    });

    it("propagates another environment", () => {
      expect(resolveAwsConfiguration({
        resumeType: "SECOND_ATTEMPT",
        envName: "uat",
        queueUrl: "https://custom.example/123/custom-queue",
      })).to.deep.equal({
        resumeType: "SECOND_ATTEMPT",
        envName: "uat",
        queueUrl: "https://custom.example/123/custom-queue",
      });
    });
  });

  describe("assertReadableFile", () => {
    it("accepts a readable file", async () => {
      await assertReadableFile("file.csv", async () => undefined);
    });

    it("reports an unavailable file", async () => {
      let error;
      try {
        await assertReadableFile("missing.csv", async () => {
          throw new Error("missing");
        });
      } catch (caught) {
        error = caught;
      }

      expect(error.message).to.include("does not exist or is not readable");
    });
  });
});
