const { expect } = require("chai");
const sinon = require("sinon");
const { createSqsClient } = require("../src/aws-client");

describe("AWS client", () => {
  it("constructs and initializes the pn-common SQS wrapper", () => {
    class FakeAwsClientsWrapper {
      constructor(account, envName) {
        this.account = account;
        this.envName = envName;
        this._initSQS = sinon.stub();
      }
    }

    const client = createSqsClient(
      { envName: "dev" },
      { AwsClientsWrapper: FakeAwsClientsWrapper }
    );

    expect(client).to.be.instanceOf(FakeAwsClientsWrapper);
    expect(client.account).to.equal("core");
    expect(client.envName).to.equal("dev");
    expect(client._initSQS.calledOnceWithExactly()).to.equal(true);
  });
});
