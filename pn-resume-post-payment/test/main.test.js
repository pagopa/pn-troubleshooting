const { expect } = require("chai");
const path = require("path");
const sinon = require("sinon");
const { main, prepareExecution } = require("../src/main");

describe("prepareExecution", () => {
  const args = [
    "--resume-type", "FIRST_ATTEMPT",
    "--region", "eu-south-1",
    "--queue-url", "https://sqs.eu-south-1.amazonaws.com/123/queue",
    "--profile", "sso_profile",
  ];

  it("prepares one resume type independently from the working directory", async () => {
    const access = sinon.stub().resolves();
    const readFile = sinon.stub().resolves("iun,recIndex\nIUN_1,0\n");
    const sqsClient = {};
    const clientFactory = sinon.stub().returns(sqsClient);
    const scriptDirectory = path.join("tmp", "pn-resume-post-payment");

    const result = await prepareExecution({
      args,
      env: {
        AWS_REGION: "invalid",
        PN_RESUME_POST_PAYMENT_QUEUE_URL: "not-a-url",
      },
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
          malformedRows: 0,
          publishableRecords: 1,
        },
      },
      queueUrl: "https://sqs.eu-south-1.amazonaws.com/123/queue",
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
        args,
        access: async () => { throw new Error("missing"); },
        clientFactory,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.include("does not exist or is not readable");
    expect(clientFactory.called).to.equal(false);
  });

  it("does not construct the client when the CSV is not readable", async () => {
    const clientFactory = sinon.stub();
    const permissionError = new Error("permission denied");
    permissionError.code = "EACCES";
    let error;

    try {
      await prepareExecution({
        args,
        access: async () => { throw permissionError; },
        clientFactory,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.include("does not exist or is not readable");
    expect(error.cause).to.equal(permissionError);
    expect(clientFactory.called).to.equal(false);
  });

  it("rejects invalid configuration before accessing the CSV", async () => {
    const access = sinon.stub();

    try {
      await prepareExecution({ args: ["--resume-type", "FIRST_ATTEMPT"], access });
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
        args,
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
      args,
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
      args: ["--resume-type", "SECOND_ATTEMPT", ...args.slice(2)],
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
      args: ["--resume-type", "SIMPLE_REGISTERED_LETTER", ...args.slice(2)],
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

  it("publishes all valid pairs, including duplicates", async () => {
    const send = sinon.stub()
      .onFirstCall().resolves({ MessageId: "message-1" })
      .onSecondCall().resolves({ MessageId: "message-2" })
      .onThirdCall().resolves({ MessageId: "message-3" });
    const logger = { log: sinon.stub(), error: sinon.stub() };

    const result = await main({
      args,
      access: sinon.stub().resolves(),
      readFile: sinon.stub().resolves([
        "iun,recIndex",
        " IUN_1 ,0",
        "IUN_1,0",
        "IUN_1,1",
        "MALFORMED,decimal",
      ].join("\n")),
      clientFactory: sinon.stub().returns({ send }),
    }, logger);

    expect(send.callCount).to.equal(3);
    expect(send.getCalls().map((call) => JSON.parse(call.args[0].input.MessageBody)))
      .to.deep.equal([
        { iun: "IUN_1", recIndex: 0, resumeType: "FIRST_ATTEMPT" },
        { iun: "IUN_1", recIndex: 0, resumeType: "FIRST_ATTEMPT" },
        { iun: "IUN_1", recIndex: 1, resumeType: "FIRST_ATTEMPT" },
      ]);
    expect(result.summary).to.include({
      totalRows: 4,
      validRows: 3,
      malformedRows: 1,
      publishableRecords: 3,
      publishedMessages: 3,
      failedPublications: 0,
      exitCode: 0,
    });
    expect(logger.error.callCount).to.equal(1);
    expect(JSON.parse(logger.error.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_MALFORMED_ROW",
      line: 5,
      error: "REC_INDEX_NOT_INTEGER",
    });
  });
});
