const { expect } = require("chai");
const path = require("path");
const sinon = require("sinon");
const { main, prepareExecution } = require("../src/main");

describe("prepareExecution", () => {
  const env = {
    AWS_REGION: "eu-south-1",
    PN_RESUME_POST_PAYMENT_QUEUE_URL: "https://sqs.eu-south-1.amazonaws.com/123/queue",
  };

  it("prepares one resume type independently from the working directory", async () => {
    const access = sinon.stub().resolves();
    const readFile = sinon.stub().resolves("iun,recIndex\nIUN_1,0\n");
    const sqsClient = {};
    const clientFactory = sinon.stub().returns(sqsClient);
    const scriptDirectory = path.join("tmp", "pn-resume-post-payment");

    const result = await prepareExecution({
      args: ["FIRST_ATTEMPT"],
      env,
      scriptDirectory,
      access,
      readFile,
      clientFactory,
    });

    expect(result).to.deep.equal({
      resumeType: "FIRST_ATTEMPT",
      csvPath: path.join(scriptDirectory, "csv", "FIRST_ATTEMPT.csv"),
      csv: {
        records: [{ iun: "IUN_1", recIndex: 0 }],
        malformedRows: [],
        counters: {
          totalRows: 1,
          validRows: 1,
          duplicateRows: 0,
          malformedRows: 0,
          publishableRecords: 1,
        },
      },
      queueUrl: env.PN_RESUME_POST_PAYMENT_QUEUE_URL,
      sqsClient,
    });
    expect(access.calledOnce).to.equal(true);
    expect(readFile.calledOnce).to.equal(true);
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

  it("does not construct the client when the CSV header is invalid", async () => {
    const clientFactory = sinon.stub();
    let error;

    try {
      await prepareExecution({
        args: ["FIRST_ATTEMPT"],
        env,
        access: sinon.stub().resolves(),
        readFile: sinon.stub().resolves("recIndex,iun\n0,IUN_1\n"),
        clientFactory,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.include("CSV header must be exactly");
    expect(clientFactory.called).to.equal(false);
  });

  it("logs malformed rows without their values", async () => {
    const logger = { log: sinon.stub(), error: sinon.stub() };
    const publisher = sinon.stub().resolves({
      publishedMessages: 1,
      failedPublications: 0,
    });
    const result = await main({
      args: ["FIRST_ATTEMPT"],
      env,
      access: sinon.stub().resolves(),
      readFile: sinon.stub().resolves("iun,recIndex\nSECRET_IUN,invalid\nIUN_2,0\n"),
      clientFactory: sinon.stub().returns({}),
    }, logger, publisher);

    expect(result.exitCode).to.equal(0);
    expect(JSON.parse(logger.error.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_MALFORMED_ROW",
      line: 2,
      error: "REC_INDEX_NOT_INTEGER",
    });
    expect(logger.error.firstCall.args[0]).not.to.include("SECRET_IUN");
    expect(JSON.parse(logger.log.firstCall.args[0])).to.include({
      event: "RESUME_POST_PAYMENT_SUMMARY",
      totalRows: 2,
      validRows: 1,
      duplicateRows: 0,
      malformedRows: 1,
      publishableRecords: 1,
      publishedMessages: 1,
      failedPublications: 0,
      exitCode: 0,
    });
  });

  it("returns a non-zero exit code and a coherent summary after a publication failure", async () => {
    const logger = { log: sinon.stub(), error: sinon.stub() };
    const publisher = sinon.stub().resolves({
      publishedMessages: 1,
      failedPublications: 1,
    });

    const result = await main({
      args: ["SECOND_ATTEMPT"],
      env,
      access: sinon.stub().resolves(),
      readFile: sinon.stub().resolves("iun,recIndex\nIUN_1,0\nIUN_2,1\n"),
      clientFactory: sinon.stub().returns({}),
    }, logger, publisher);

    expect(result.exitCode).to.equal(1);
    expect(result.summary).to.include({
      event: "RESUME_POST_PAYMENT_SUMMARY",
      resumeType: "SECOND_ATTEMPT",
      totalRows: 2,
      validRows: 2,
      duplicateRows: 0,
      malformedRows: 0,
      publishableRecords: 2,
      publishedMessages: 1,
      failedPublications: 1,
      exitCode: 1,
    });
    expect(result.summary.publishableRecords).to.equal(
      result.summary.publishedMessages + result.summary.failedPublications
    );
  });

  it("succeeds without publishing when the CSV contains only malformed rows", async () => {
    const logger = { log: sinon.stub(), error: sinon.stub() };
    const publisher = sinon.stub().resolves({
      publishedMessages: 0,
      failedPublications: 0,
    });

    const result = await main({
      args: ["SIMPLE_REGISTERED_LETTER"],
      env,
      access: sinon.stub().resolves(),
      readFile: sinon.stub().resolves("iun,recIndex\nIUN_1,invalid\n"),
      clientFactory: sinon.stub().returns({}),
    }, logger, publisher);

    expect(publisher.firstCall.args[0].records).to.deep.equal([]);
    expect(result.exitCode).to.equal(0);
    expect(result.summary).to.include({
      publishableRecords: 0,
      publishedMessages: 0,
      failedPublications: 0,
      malformedRows: 1,
      exitCode: 0,
    });
  });
});
