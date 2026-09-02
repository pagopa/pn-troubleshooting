const { expect } = require("chai");
const sinon = require("sinon");
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
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

  it("publishes serialized payloads to the configured queue", async () => {
    const sqsClient = { send: sinon.stub().resolves({ MessageId: "message-1" }) };
    const logger = createLogger();
    class FakeCommand {
      constructor(input) {
        this.input = input;
      }
    }

    const result = await publishRecords({
      records: [{ iun: "IUN_1", recIndex: 0 }],
      resumeType: "FIRST_ATTEMPT",
      queueUrl: "https://sqs.example/queue",
      sqsClient,
      logger,
      Command: FakeCommand,
    });

    expect(sqsClient.send.firstCall.args[0].input).to.deep.equal({
      QueueUrl: "https://sqs.example/queue",
      MessageBody: JSON.stringify({
        iun: "IUN_1",
        recIndex: 0,
        resumeType: "FIRST_ATTEMPT",
      }),
    });
    expect(result).to.deep.equal({ publishedMessages: 1, failedPublications: 0 });
    expect(JSON.parse(logger.log.firstCall.args[0])).to.deep.equal({
      event: "RESUME_POST_PAYMENT_PUBLISHED",
      iun: "IUN_1",
      recIndex: 0,
      resumeType: "FIRST_ATTEMPT",
      messageId: "message-1",
    });
  });

  it("constructs the AWS SDK SendMessageCommand by default", async () => {
    const sqsClient = { send: sinon.stub().resolves({ MessageId: "message-1" }) };

    await publishRecords({
      records: [{ iun: "IUN_1", recIndex: 4 }],
      resumeType: "SIMPLE_REGISTERED_LETTER",
      queueUrl: "https://sqs.example/queue",
      sqsClient,
      logger: createLogger(),
    });

    const command = sqsClient.send.firstCall.args[0];
    expect(command).to.be.instanceOf(SendMessageCommand);
    expect(command.input).to.deep.equal({
      QueueUrl: "https://sqs.example/queue",
      MessageBody: JSON.stringify({
        iun: "IUN_1",
        recIndex: 4,
        resumeType: "SIMPLE_REGISTERED_LETTER",
      }),
    });
  });

  it("continues after exceptions and responses without MessageId", async () => {
    const sqsClient = {
      send: sinon.stub()
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

    expect(sqsClient.send.callCount).to.equal(3);
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
    const sqsClient = { send: sinon.stub().rejects("failure") };
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