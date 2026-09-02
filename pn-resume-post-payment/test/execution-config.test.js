const { expect } = require("chai");
const path = require("path");
const {
  RESUME_TYPE_FILES,
  assertReadableFile,
  resolveAwsEnvironment,
  resolveCsvPath,
  resolveResumeType,
} = require("../src/execution-config");

describe("execution config", () => {
  describe("resolveResumeType", () => {
    Object.keys(RESUME_TYPE_FILES).forEach((resumeType) => {
      it(`accepts ${resumeType}`, () => {
        expect(resolveResumeType([resumeType])).to.equal(resumeType);
      });
    });

    it("rejects a missing argument", () => {
      expect(() => resolveResumeType([])).to.throw("Exactly one resumeType");
    });

    it("rejects multiple positional arguments", () => {
      expect(() => resolveResumeType(["FIRST_ATTEMPT", "SECOND_ATTEMPT"]))
        .to.throw("Exactly one resumeType");
    });

    it("rejects CLI options", () => {
      expect(() => resolveResumeType(["--profile"]))
        .to.throw("CLI options are not supported");
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

  describe("resolveAwsEnvironment", () => {
    const requiredEnv = {
      AWS_REGION: "eu-south-1",
      PN_RESUME_POST_PAYMENT_QUEUE_URL: "https://sqs.eu-south-1.amazonaws.com/123/queue",
    };

    it("reads optional profile and endpoint from the environment", () => {
      const result = resolveAwsEnvironment({
        ...requiredEnv,
        AWS_PROFILE: "sso_profile",
        SQS_ENDPOINT_URL: "http://localhost:4566",
      });

      expect(result).to.deep.equal({
        region: "eu-south-1",
        queueUrl: requiredEnv.PN_RESUME_POST_PAYMENT_QUEUE_URL,
        profile: "sso_profile",
        endpoint: "http://localhost:4566",
      });
    });

    it("uses AWS_DEFAULT_REGION as fallback", () => {
      const result = resolveAwsEnvironment({
        AWS_DEFAULT_REGION: "us-east-1",
        PN_RESUME_POST_PAYMENT_QUEUE_URL: "http://localhost:4566/123/queue",
      });

      expect(result.region).to.equal("us-east-1");
    });

    it("prefers AWS_REGION over AWS_DEFAULT_REGION", () => {
      const result = resolveAwsEnvironment({
        ...requiredEnv,
        AWS_DEFAULT_REGION: "us-east-1",
      });

      expect(result.region).to.equal("eu-south-1");
    });

    it("rejects a missing region", () => {
      expect(() => resolveAwsEnvironment({
        PN_RESUME_POST_PAYMENT_QUEUE_URL: requiredEnv.PN_RESUME_POST_PAYMENT_QUEUE_URL,
      })).to.throw("AWS_REGION or AWS_DEFAULT_REGION");
    });

    it("rejects an invalid region", () => {
      expect(() => resolveAwsEnvironment({
        AWS_REGION: "invalid",
        PN_RESUME_POST_PAYMENT_QUEUE_URL: requiredEnv.PN_RESUME_POST_PAYMENT_QUEUE_URL,
      })).to.throw("AWS_REGION or AWS_DEFAULT_REGION");
    });

    it("rejects an invalid queue URL", () => {
      expect(() => resolveAwsEnvironment({
        AWS_REGION: "eu-south-1",
        PN_RESUME_POST_PAYMENT_QUEUE_URL: "not-a-url",
      })).to.throw("PN_RESUME_POST_PAYMENT_QUEUE_URL");
    });

    it("rejects an invalid optional endpoint", () => {
      expect(() => resolveAwsEnvironment({
        ...requiredEnv,
        SQS_ENDPOINT_URL: "not-a-url",
      })).to.throw("SQS_ENDPOINT_URL");
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
