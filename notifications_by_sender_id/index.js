const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: node index.js --awsProfile <aws-profile> --ipaCode <ipaCode>"
  //CHECKING PARAMETER
  args.forEach(el => {
    if(el.mandatory && !values.values[el.name]){
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el=> {
    return el.subcommand.length > 0
  }).forEach(el => {
    if(values.values[el.name]) {
      el.subcommand.forEach(val => {
        if (!values.values[val]) {
          console.log("SubParam " + val + " is not defined")
          console.log(usage)
          process.exit(1)
        }
      })
    }
  })
}

function addMonth(currentYearMonth){
  var year = parseInt(currentYearMonth.substring(0,4));
  var month = parseInt(currentYearMonth.substring(4,6));
  if(month == 12){
    year = year + 1;
    month = 1;
  } else {
    month = month + 1;
  }
  return year + ''+ (month < 10 ? '0' + month : month);
}

async function getNotificationsBySenderId(senderId) {

  const awsClient = new AwsClientsWrapper( awsProfile );
  const startYearMonth = '202401';
  const endYearMonth = '202407';
  let currentYearMonth = startYearMonth;

  const items = []
  while(currentYearMonth <= endYearMonth) {
    let lastEvaluatedKey = null;
    let first = true;

    const senderId_creationMonth = senderId+'##'+currentYearMonth;

    console.log('senderId_creationMonth: '+ senderId_creationMonth)
    while(first || lastEvaluatedKey != null) {
      const res = await awsClient._queryTable('pn-NotificationsMetadata', 'senderId_creationMonth = :senderId_creationMonth', {
        ':senderId_creationMonth': {
          S: senderId_creationMonth
        }
      }, lastEvaluatedKey, 'senderId');

      first = false;
      lastEvaluatedKey = res.LastEvaluatedKey;
      items.push(...res.Items);
    }

    currentYearMonth = addMonth(currentYearMonth);
  }

  return Array.from(new Set([... items.map(item => {
    return item.iun_recipientId.S.split('##')[0]
  })]))
}

async function getSenderIdByIpaCode(awsProfile, ipaCode) {
  const awsClient = new AwsClientsWrapper( awsProfile );
  let first = true;
  var results = []
  var lastEvaluatedKey = null
  while(first || lastEvaluatedKey != null) {
    var res = await awsClient._scanRequest('pn-OnboardInstitutions', 'ipaCode = :ipaCode', {
      ':ipaCode': {
        S: ipaCode
      }
    }, lastEvaluatedKey);
    if(res.LastEvaluatedKey) {
      lastEvaluatedKey = res.LastEvaluatedKey
    } 
    else {
      lastEvaluatedKey = null;
      first = false;
    }
    results = results.concat(res.Items);
  }

  if(results.length > 0) {
    return results[0].id.S
  }

  return null
}

async function main() {

  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "ipaCode", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { awsProfile, ipaCode, filter },
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string", short: "p", default: undefined
      },
      ipaCode: {
        type: "string", short: "t", default: undefined
      }
    },
  });  

  _checkingParameters(args, values)

  
  const senderId = await getSenderIdByIpaCode(awsProfile, ipaCode)

  console.log('SenderID: '+ senderId)

  const notifications = await getNotificationsBySenderId(senderId)

  console.log('Per il codice IPA '+ipaCode+' sono state recuperate '+notifications.length+' notifiche')

  fs.writeFileSync('notifications_'+ipaCode+'.txt', notifications.join('\n'))
}

main();