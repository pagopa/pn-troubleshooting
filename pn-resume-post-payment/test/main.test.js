const { expect } = require("chai");
const path = require("path");
const sinon = require("sinon");
const { prepareExecution } = require("../src/main");

describe("prepareExecution", () => {
  const env = {
    AWS_REGION: "eu-south-1",
    PN_RESUME_POST_PAYMENT_QUEUE_URL: "https://sqs.eu-south-1.amazonaws.com/123/queue",
  };

  it("prepares one resume type independently from the working directory", async () => {
    const access = sinon.stub().resolves();
    const sqsClient = {};
    const clientFactory = sinon.stub().returns(sqsClient);
    const scriptDirectory = path.join("tmp", "pn-resume-post-payment");

    const result = await prepareExecution({
      args: ["FIRST_ATTEMPT"],
      env,
      scriptDirectory,
      access,
      clientFactory,
    });

    expect(result).to.deep.equal({
      resumeType: "FIRST_ATTEMPT",
      csvPath: path.join(scriptDirectory, "csv", "FIRST_ATTEMPT.csv"),
      queueUrl: env.PN_RESUME_POST_PAYMENT_QUEUE_URL,
      sqsClient,
    });
    expect(access.calledOnce).to.equal(true);
    expect(clientFactory.calledOnce).to.equal(true);
  });

  it("does not construct the client when the CSV is unavailable", async () => {
    const clientFactory = sinon.stub();
    let error;

    try {
      await prepareExecution({
        args: ["FIRST_ATTEMPT"],
        env,
        access: async () => { throw new Error("missing"); },
        clientFactory,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.include("does not exist or is not readable");
    expect(clientFactory.called).to.equal(false);
  });

  it("rejects invalid configuration before accessing the CSV", async () => {
    const access = sinon.stub();

    try {
      await prepareExecution({ args: ["FIRST_ATTEMPT"], env: {}, access });
    } catch {
      // Expected preliminary validation failure.
    }
    expect(access.called).to.equal(false);
  });
});
