const { spawn } = require('node:child_process');
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const profile = "sso_pn-core-hotfix";


async function checklogin() {
  try {
    clientSTS = new STSClient({
      region: "eu-south-1",
      credentials: fromIni({ profile })
    });
    command = new GetCallerIdentityCommand({});
    response = await clientSTS.send(command);
    console.log('You are successfully logged into SSO with the following account:');
    console.log('\nUserId: ' + response.UserId);
    console.log('Account: ' + response.Account);
    console.log('Arn: ' + response.Arn);
    return response;
  }  
  catch (error) {
    if (error.name === 'CredentialsProviderError' ||
       error.message?.includes('expired') ||
       error.message?.includes('credentials')) {
       console.error(`\n=== SSO Authentication Error client ===`);
       console.error('Your SSO session has expired or is invalid.');
       console.error('Please follow this step for execute a new SSO login:');
       awsSSOlogin();
    }
  }
}

function awsSSOlogin() {
  login =  spawn('aws', ['sso', 'login', '--profile', profile]);

  login.stdout.on('data', (data) => {
    console.log(`${data}`);
  });

  login.stderr.on('data', (data) => {
    console.error(`${data}`);
  });

  login.on('close', (code) => {
    console.log(`Proces exited with code ${code}`);
  });
}


checklogin();
