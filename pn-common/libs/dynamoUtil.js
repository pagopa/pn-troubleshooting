const { marshall } = require("@aws-sdk/util-dynamodb");

function prepareKeys(data) {
    let keys = {};
    Object.keys(data).forEach(k => {
      keys[k] = marshall(data[k])
    });
    return keys;
  }
  
function prepareExpressionAttributeNames(data) {
  let expressionAttributeNames = {};
  Object.keys(data).forEach(k => {
      expressionAttributeNames[data[k]['codeAttr']] = k
  });
  return expressionAttributeNames;
}

function prepareExpressionAttributeValues(data) {
  let expressionAttributeValues = {};
  Object.keys(data).forEach(k => {
    if(data[k]['codeValue']){
      expressionAttributeValues[data[k]['codeValue']] = marshall(data[k]['value'])
    }
   
    if(data[k]['condCodeValue']){
      expressionAttributeValues[data[k]['condCodeValue']] = marshall(data[k]['condValue'])
    }
  });
  return expressionAttributeValues;
}

function prepareUpdateExpression(operator, data) {
  let updateExpression = `${operator} `
  Object.keys(data).forEach(k => {
    if(data[k]['codeValue']){
      updateExpression = `${updateExpression} ${data[k]['codeAttr']} = ${data[k]['codeValue']},`
    }
  });
  return updateExpression.substring(0, updateExpression.length - 1)
}

function prepareKeyConditionExpression(data, logicalOperator) {
  let conditionExpression = '' 
  Object.keys(data).forEach(k => {
    if(data[k]['operator']) {
      conditionExpression = `${conditionExpression} ${data[k]['codeAttr']} ${data[k]['operator']} ${data[k]['codeValue']} ${logicalOperator}`
    }
  });
  return conditionExpression.substring(0, conditionExpression.length -  logicalOperator.length)
}

module.exports = { 
  prepareKeys, 
  prepareExpressionAttributeNames,
  prepareExpressionAttributeValues, 
  prepareUpdateExpression,
  prepareKeyConditionExpression
};