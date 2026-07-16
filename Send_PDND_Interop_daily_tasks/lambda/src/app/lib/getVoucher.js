// Make sure you're using Node.js v18 or newer for built-in fetch
import querystring from 'node:querystring';
import fetch from 'node-fetch';

export async function getVoucher(baseUrl, clientId, assertion) {
  const url = 'https://auth.' + baseUrl + '/token.oauth2'
  console.log('url: ', url);
  // Construct the body as application/x-www-form-urlencoded
  
  const body = querystring.stringify({
    client_id: clientId,
    client_assertion: assertion,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    grant_type: 'client_credentials',
  });

  console.log('body: ', body);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    console.log('Access Token:', data.access_token);
    return data.access_token;
  } catch (err) {
    console.error('Token request failed:', err.message);
  }
}
