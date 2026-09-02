const { expect } = require("chai");
const sinon = require("sinon");
const { run } = require("../index");

describe("CLI entrypoint", () => {
  it("returns the main success exit code", async () => {
    const mainFunction = sinon.stub().resolves({ exitCode: 0 });
    const logger = { log: sinon.stub(), error: sinon.stub() };

    const exitCode = await run({
      args: ["FIRST_ATTEMPT"],
      env: { AWS_REGION: "eu-south-1" },
      logger,
      mainFunction,
    });

    expect(exitCode).to.equal(0);
    expect(mainFunction.calledOnce).to.equal(true);
    expect(logger.error.called).to.equal(false);
  });

  it("returns a non-zero exit code for preliminary errors", async () => {
    const mainFunction = sinon.stub().rejects(new Error("Invalid preliminary configuration"));
    const logger = { log: sinon.stub(), error: sinon.stub() };

    const exitCode = await run({ args: [], env: {}, logger, mainFunction });

    expect(exitCode).to.equal(1);
    expect(JSON.parse(logger.error.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_SCRIPT_ERROR",
      error: "Invalid preliminary configuration",
    });
  });

  it("returns the publication failure exit code", async () => {
    const exitCode = await run({
      logger: { log: sinon.stub(), error: sinon.stub() },
      mainFunction: sinon.stub().resolves({ exitCode: 1 }),
    });

    expect(exitCode).to.equal(1);
  });
});