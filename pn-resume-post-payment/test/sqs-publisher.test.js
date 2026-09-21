const { expect } = require("chai");
const sinon = require("sinon");
const {
  buildMessagePayload,
  publishRecords,
} = require("../src/sqs-publisher");

describe("SQS publisher", () => {
  [
    "FIRST_ATTEMPT",
    "SECOND_ATTEMPT",
    "SIMPLE_REGISTERED_LETTER",
  ].forEach((resumeType) => {
    it(`builds the exact ${resumeType} payload`, () => {
      expect(buildMessagePayload({ iun: "IUN_1", recIndex: 2 }, resumeType))
        .to.deep.equal({ iun: "IUN_1", recIndex: 2, resumeType });
    });
  });

  it("publishes payloads through pn-common to the configured queue", async () => {
    const sqsClient = {
      _sendSQSMessage: sinon.stub().resolves({ MessageId: "message-1" }),
    };
    const logger = createLogger();

    const result = await publishRecords({
      records: [{ iun: "IUN_1", recIndex: 0 }],
      resumeType: "FIRST_ATTEMPT",
      queueUrl: "https://sqs.example/queue",
      sqsClient,
      logger,
    });

    expect(sqsClient._sendSQSMessage.calledOnceWithExactly(
      "https://sqs.example/queue",
      {
        iun: "IUN_1",
        recIndex: 0,
        resumeType: "FIRST_ATTEMPT",
      }
    )).to.equal(true);
    expect(result).to.deep.equal({ publishedMessages: 1, failedPublications: 0 });
    expect(JSON.parse(logger.log.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_PUBLISHED",
      iun: "IUN_1",
      recIndex: 0,
      resumeType: "FIRST_ATTEMPT",
      messageId: "message-1",
    });
  });

  it("continues after exceptions and responses without MessageId", async () => {
    const sqsClient = {
      _sendSQSMessage: sinon.stub()
        .onFirstCall().rejects(new Error("Access denied"))
        .onSecondCall().resolves({})
        .onThirdCall().resolves({ MessageId: "message-3" }),
    };
    const logger = createLogger();

    const result = await publishRecords({
      records: [
        { iun: "IUN_1", recIndex: 0 },
        { iun: "IUN_2", recIndex: 1 },
        { iun: "IUN_3", recIndex: 2 },
      ],
      resumeType: "SECOND_ATTEMPT",
      queueUrl: "https://sqs.example/queue",
      sqsClient,
      logger,
    });

    expect(sqsClient._sendSQSMessage.callCount).to.equal(3);
    expect(result).to.deep.equal({ publishedMessages: 1, failedPublications: 2 });
    expect(JSON.parse(logger.error.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_PUBLICATION_FAILED",
      iun: "IUN_1",
      recIndex: 0,
      resumeType: "SECOND_ATTEMPT",
      cause: "Access denied",
    });
    expect(JSON.parse(logger.error.secondCall.args[0]).cause)
      .to.equal("SQS response does not contain MessageId");
  });

  it("uses a generic cause for non-Error failures", async () => {
    const sqsClient = { _sendSQSMessage: sinon.stub().rejects("failure") };
    const logger = createLogger();

    await publishRecords({
      records: [{ iun: "IUN_1", recIndex: 0 }],
      resumeType: "FIRST_ATTEMPT",
      queueUrl: "https://sqs.example/queue",
      sqsClient,
      logger,
    });

    expect(JSON.parse(logger.error.firstCall.args[0]).cause)
      .to.equal("Unknown SQS publication error");
  });
});

function createLogger() {
  return { log: sinon.stub(), error: sinon.stub() };
}