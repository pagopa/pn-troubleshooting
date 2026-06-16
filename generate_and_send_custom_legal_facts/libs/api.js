async function createPresignedUrl(cxId, checksum, reqBody) {
  const requestUrl = `${process.env.ALB_SAFESTORAGE_BASE_URL}/safe-storage/v1/files`;
  
  const initResp = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      "x-pagopa-safestorage-cx-id": cxId,
      "content-type": "application/json",
      "x-checksum": "SHA-256",
      "x-checksum-value": checksum,
      "x-api-key": process.env.SAFESTORAGE_CLIENT_API_KEY
    },
    body: JSON.stringify(reqBody)
  });

  const respData = await initResp.json();

  if (!initResp.ok) {
    throw new Error(`Impossibile ottenere l'URI presigned: HTTP ${initResp.status} - ${JSON.stringify(respData)}`);
  }
  
  const { uploadUrl, secret, key } = respData;
  return { uploadUrl, secret, key };
}

async function uploadFileToPresignedUrl(uploadUrl, contentType, checksum, secret, fileContent) {
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      "Content-Type": contentType,
      "x-amz-checksum-sha256": checksum,
      "x-amz-meta-secret": secret
    },
    body: fileContent
  });

  if (!uploadResp.ok) {
    const errorText = await uploadResp.text();
    throw new Error(`Impossibile caricare il file: HTTP ${uploadResp.status} - ${errorText}`);
  }
}

async function createLegalFactsDocument(documentContent, isMock) { 
  const endpoint = isMock 
    ? '/templates-engine-private/v1/templates/analog-delivery-workflow-failure-legal-fact' 
    : '/templates-engine-private/v1/templates/analog-feedback-availability-statement';

  const requestUrl = `${process.env.ALB_TEMPLATE_ENGINE_BASE_URL}${endpoint}`;
  
  const initResp = await fetch(requestUrl, {
    method: 'PUT',
    headers: {
      "x-language": "IT",
      "content-type": "application/json"
    },
    body: JSON.stringify(documentContent)
  });

  if (!initResp.ok) {
    const errorText = await initResp.text();
    throw new Error(`Creazione documento fallita: HTTP ${initResp.status} - ${errorText}`);
  }

  // Leggiamo la risposta direttamente come ArrayBuffer
  const fileContent = await initResp.arrayBuffer();
  return { fileContent };
}

const ApiClient = {
  createPresignedUrl,
  uploadFileToPresignedUrl,
  createLegalFactsDocument
};

exports.ApiClient = ApiClient;