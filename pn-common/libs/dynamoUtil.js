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
      expressionAttributeValues[data[k]['codeValue']] = marshall(data[k]['value'])
    });
    return expressionAttributeValues;
  }
  
  function prepareUpdateExpression(operator, data) {
    let updateExpression = `${operator} `
    Object.keys(data).forEach(k => {
      updateExpression = `${updateExpression} ${data[k]['codeAttr']} = ${data[k]['codeValue']},`
    });
    return updateExpression.substring(0, updateExpression.length - 1)
  }
  
  module.exports = { 
    prepareKeys, 
    prepareExpressionAttributeNames,
    prepareExpressionAttributeValues, 
    prepareUpdateExpression 
};