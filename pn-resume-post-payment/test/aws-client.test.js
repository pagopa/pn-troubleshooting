const { expect } = require("chai");
const sinon = require("sinon");
const { buildSqsClientConfig, createSqsClient } = require("../src/aws-client");

describe("AWS client", () => {
  it("uses fromIni when a profile is configured", () => {
    const credentials = {};
    const credentialProvider = sinon.stub().returns(credentials);

    const config = buildSqsClientConfig({
      region: "eu-south-1",
      profile: "sso_profile",
    }, credentialProvider);

    expect(credentialProvider.calledOnceWithExactly({ profile: "sso_profile" })).to.equal(true);
    expect(config).to.deep.equal({ region: "eu-south-1", credentials });
  });

  it("leaves credentials to the default provider chain without a profile", () => {
    const credentialProvider = sinon.stub();

    const config = buildSqsClientConfig({ region: "eu-south-1" }, credentialProvider);

    expect(credentialProvider.called).to.equal(false);
    expect(config).to.deep.equal({ region: "eu-south-1" });
  });

  it("configures the optional SQS endpoint", () => {
    const config = buildSqsClientConfig({
      region: "us-east-1",
      endpoint: "http://localhost:4566",
    });

    expect(config).to.deep.equal({
      region: "us-east-1",
      endpoint: "http://localhost:4566",
    });
  });

  it("constructs an injectable SQS client", () => {
    class FakeSqsClient {
      constructor(config) {
        this.config = config;
      }
    }

    const client = createSqsClient(
      { region: "eu-south-1" },
      { SqsClient: FakeSqsClient }
    );

    expect(client).to.be.instanceOf(FakeSqsClient);
    expect(client.config).to.deep.equal({ region: "eu-south-1" });
  });
});
