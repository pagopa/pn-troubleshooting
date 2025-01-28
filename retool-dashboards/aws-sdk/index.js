import * as DynamoDB from "@aws-sdk/client-dynamodb";
import * as Lambda from "@aws-sdk/client-lambda";

export const clientDynamodb = DynamoDB;
export const clientLambda = Lambda;