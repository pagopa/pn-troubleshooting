/*
Inizializza il tracking delle spedizioni dato il file di input

Variabili d'ambiente:
- HOST: hostname del microservizio (es. http://localhost:3000)
- INPUT_FILE: file JSONL con i body delle richieste (es. out/1_createTracking/PCRETRY0_<timestamp>_init_tracking.jsonl)
- BATCH_SIZE: numero di richieste concorrenti (default 10)
- DELAY_MS: delay tra batch in millisecondi (default 0)

Output:
- ERROR_<timestamp>.jsonl (oggetti con errore dettagliato)
- UNPROCESSED_<timestamp>.jsonl (solo i body non processati, rilanciabili)
*/

import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

const host = process.env.HOST;
const inputFile = process.env.INPUT_FILE;
const batchSize = parseInt(process.env.BATCH_SIZE || "10", 10);
const delayMs = parseInt(process.env.DELAY_MS || "0", 10);

if (!host || !inputFile) {
  console.error("Errore: devi definire HOST e INPUT_FILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("HOST:", host);
console.log("INPUT_FILE:", inputFile);
console.log("BATCH_SIZE:", batchSize);
console.log("DELAY_MS:", delayMs);
console.log("======================\n");

// Directory output
const outDir = path.join("out", path.basename(import.meta.url).replace(".js", ""));
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const errorFile = path.join(outDir, `ERROR_${timestamp}.jsonl`);
const unprocessedFile = path.join(outDir, `UNPROCESSED_${timestamp}.jsonl`);

/**
 * Mostra una barra di progresso in console
 */
function showProgress(current, total, prefix = '') {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const emptyLength = barLength - filledLength;
  
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  const line = `\r${prefix}[${bar}] ${percentage}% (${current}/${total})`;
  
  process.stdout.write(line);
  
  if (current >= total) {
    process.stdout.write('\n');
  }
}

/**
 * Crea il tracking tramite API
 */
async function createTracking(body) {
  try {
    const url = `${host}/paper-tracker-private/v1/init`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 201) {
      return { success: true };
    } else {
      let errorDetail;
      try {
        errorDetail = await res.json();
      } catch {
        errorDetail = await res.text();
      }
      return {
        success: false,
        status: res.status,
        error: errorDetail,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Processa un batch di richieste in parallelo
 */
async function processBatch(bodies) {
  const promises = bodies.map(body => createTracking(body));
  const results = await Promise.allSettled(promises);
  
  const errors = [];
  
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push({
        body: bodies[index],
        error: result.reason.message || result.reason,
      });
    } else if (!result.value.success) {
      errors.push({
        body: bodies[index],
        status: result.value.status,
        error: result.value.error,
      });
    }
  });
  
  return errors;
}

/**
 * Divide un array in chunks
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Scrive gli errori e i body non processati nei rispettivi file JSONL
 */
function writeErrorsAndUnprocessed(errors) {
  if (errors.length === 0) return;
  
  // Errori dettagliati
  const errorContent = errors.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(errorFile, errorContent, 'utf-8');
  
  // Solo i body non processati
  const unprocessedContent = errors.map(e => JSON.stringify(e.body)).join('\n') + '\n';
  fs.appendFileSync(unprocessedFile, unprocessedContent, 'utf-8');
}

(async () => {
  try {
    // Leggi file JSONL
    console.log("Lettura file di input...");
    const lines = fs.readFileSync(inputFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    
    const bodies = lines.map(line => JSON.parse(line));
    
    console.log(`Trovati ${bodies.length} tracking da inizializzare\n`);
    
    if (bodies.length === 0) {
      console.log("Nessun tracking da processare.");
      return;
    }

    let totalSuccess = 0;
    let totalErrors = 0;

    // Processa in batch
    const batches = chunk(bodies, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      showProgress(i, batches.length, 'Progresso: ');
      
      const errors = await processBatch(batches[i]);
      
      const successCount = batches[i].length - errors.length;
      totalSuccess += successCount;
      totalErrors += errors.length;
      
      if (errors.length > 0) {
        writeErrorsAndUnprocessed(errors);
      }
      
      // Delay tra batch
      if (i < batches.length - 1 && delayMs > 0) {
        await setTimeout(delayMs);
      }
    }
    
    showProgress(batches.length, batches.length, 'Progresso: ');

    console.log(`\n=== RISULTATI FINALI ===`);
    console.log(`Tracking creati con successo: ${totalSuccess}`);
    console.log(`Errori: ${totalErrors}`);
    
    if (totalErrors > 0) {
      console.log(`\nFile errori: ${errorFile}`);
      console.log(`File unprocessed: ${unprocessedFile}`);
    }

  } catch (err) {
    console.error("\nErrore generale:", err);
    process.exit(1);
  }
})();
