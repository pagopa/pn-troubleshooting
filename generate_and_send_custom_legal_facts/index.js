require('dotenv').config();
const { parseArgs } = require('util');
const fs = require('fs');
const crypto = require('crypto');
const { ApiClient } = require("./libs/api"); // Assicurati che api.js si trovi in ./libs/
const { _parseCSV } = require('pn-common/libs/utils');

function checkParameters(values) {
  const { fileName, cxId } = values;
  const usage = "Usage: node index.js --fileName <file-name> --cxId <cx-id> [--mock] [--contentType <type>] [--documentType <type>] [--status <status>]";
  
  if (!fileName || !cxId) {
    console.error("Error: I parametri --fileName e --cxId sono obbligatori.");
    console.info(usage);
    process.exit(1);
  }
}

function prepareDocumentContent(row, isMock) {
  if (isMock) {
    return {
      "endWorkflowTime": "2024-01-01T12:00:00Z",
      "endWorkflowDate": "2024-01-01T12:00:00Z",
      "recipient": {
        "denomination": "MOCK-CODE-12345",
        "taxId": "MOCK-TAX-ID-1234567890"
      },
      "iun": "APQW-MKNX-GLVJ-202505-T-1"
    };
  }
  return {
    "declarationDate": row.send_analog_progress_ts_local_it,
    "iun": row.iun,
    "senderDenomination": row.descrizione_ente,
    "registeredLetterCode": row.codiceoggetto,
    "senderTaxId": row.codice_fiscale
  };
}

function prepareDocumentContentType(isMock, contentType, documentType, status) {
  if (isMock) {
    return {
      "contentType": "application/pdf",
      "documentType": "PN_LEGAL_FACTS",
      "status": "SAVED"
    };
  }
  return { contentType, documentType, status };
}

function calculateChecksum(fileContent) {
  return crypto.createHash('sha256').update(fileContent).digest('base64');
}

async function main() {
  const { values } = parseArgs({
    options: {
      fileName: { type: "string", short: "t" },
      cxId: { type: "string", short: "i" },
      mock: { type: "boolean", short: "m", default: false },
      contentType: { type: "string", short: "c" },
      documentType: { type: "string", short: "d" },
      status: { type: "string", short: "s" }
    },
  });

  checkParameters(values);

  const { fileName, cxId, mock, contentType, documentType, status } = values;
  const failedRequestIds = [];

  console.log('Reading from file...');
  const parsedCsv = await _parseCSV(fileName, ";");

  // mkdir directory if not exists
  const dirPath = './generated_documents';
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const documentContentType = prepareDocumentContentType(mock, contentType, documentType, status);

  for (const row of parsedCsv) {
    const { iun } = row;
    const documentContent = prepareDocumentContent(row, mock);
    const filePath = `${dirPath}/legal_fact_${iun}.pdf`;

    console.log(`\n--- Elaborazione IUN: ${iun} ---`);

    try {
      // 1. Creazione documento legale
      console.log(`Generazione documento in corso...`);
      const { fileContent } = await ApiClient.createLegalFactsDocument(documentContent, mock);
      
      const fileBuffer = Buffer.from(fileContent);
      fs.writeFileSync(filePath, fileBuffer);
      console.log(`Documento salvato localmente: ${filePath}`);

      // 2. Calcolo Checksum
      const checksum = calculateChecksum(fileBuffer);
      console.log(`Checksum calcolato: ${checksum}`);

      // 3. Generazione URL Presigned e Upload
      const { uploadUrl, secret, key } = await ApiClient.createPresignedUrl(cxId, checksum, documentContentType);
      await ApiClient.uploadFileToPresignedUrl(uploadUrl, "application/pdf", checksum, secret, fileBuffer);
      console.log(`File caricato correttamente: ${key}`);
      
      // 4. Successo
      const successFilePath = `${dirPath}/result.json`;
      fs.appendFileSync(successFilePath, JSON.stringify({ iun, attachments: [key] }) + "\n");
      console.log(`[SUCCESSO] Documento caricato correttamente in safe storage. Dettagli salvati in: ${successFilePath}`);
    } catch (error) {
      console.error(`[ERRORE] Fallimento per IUN ${iun}: ${error.message}`);
      failedRequestIds.push({ iun, error: error.message });
    }
  }

  // Risultato finale
  console.log("\n====================================");
  if (failedRequestIds.length > 0) {
    console.warn(`Richieste fallite: \n${JSON.stringify(failedRequestIds, null, 2)}`);
  } else {
    console.log("Tutti i documenti sono stati generati e caricati con successo.");
  }
}

main().catch(err => {
  console.error("Errore critico durante l'esecuzione:", err);
  process.exit(1);
});