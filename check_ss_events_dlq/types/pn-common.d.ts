declare module 'pn-common' {
  export class AwsClientsWrapper {
    constructor();
    
    // AWS client methods for SQS, S3, STS, DynamoDB
    getS3Client(): any;
    getSTSClient(): any;
    getSQSClient(): any;
    getDynamoDBClient(): any;
    
  }
}