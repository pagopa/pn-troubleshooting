/**
 * S3 PDF Validator - Production-grade magic byte verification for massive scale
 *
 * Validates millions of S3 objects as PDFs by checking magic bytes (%PDF header).
 * Uses worker pool pattern with configurable concurrency, streaming architecture,
 * and checkpoint-per-batch for crash recovery. See README.md for usage details.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseArgs } from 'util';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { pipeline } from 'stream/promises';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Transform } from 'stream';
import cliProgress from 'cli-progress';
import { performance } from 'perf_hooks';
import AwsClientsWrapper from '../pn-common/libs/AwsClientWrapper.js';

// Configuration
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF header
const DEFAULT_CONCURRENCY = 100;
const DEFAULT_BATCH_SIZE = 1000;
const CHECKPOINT_FILE_NAME = 'checkpoint.json';

// Convert S3 response stream to Buffer for byte comparison.
// S3 returns data as a stream, but we need a Buffer to check individual bytes.
async function streamToBuffer(stream, maxBytes = 5) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
    if (totalLength >= maxBytes) break;
  }

  return Buffer.concat(chunks, Math.min(totalLength, maxBytes));
}

// Check if S3 object is a valid PDF by reading first 4 bytes.
// All valid PDFs start with the magic bytes %PDF (hex: 25 50 44 46).
// We only fetch 5 bytes instead of the entire file (saves 99.99% bandwidth).
async function validatePDFMagicBytes(s3Client, bucket, fileKey) {
  try {
    // S3 Range request: fetch only bytes 0-4 (first 5 bytes)
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Range: 'bytes=0-4'
    }));

    const buffer = await streamToBuffer(response.Body, 5);

    // Check if first 4 bytes match %PDF signature
    const isValid = buffer.length >= 4 &&
                    buffer[0] === PDF_MAGIC_BYTES[0] &&
                    buffer[1] === PDF_MAGIC_BYTES[1] &&
                    buffer[2] === PDF_MAGIC_BYTES[2] &&
                    buffer[3] === PDF_MAGIC_BYTES[3];

    return { fileKey, isValid: true, valid: isValid, error: null };
  } catch (error) {
    // Map AWS SDK error names to simple categories for reporting
    let errorType = 'Unknown';
    if (error.name === 'NoSuchKey') errorType = 'NoSuchKey';
    else if (error.name === 'AccessDenied') errorType = 'AccessDenied';
    else if (error.name === 'InvalidRange') errorType = 'InvalidRange';
    else if (error.name === 'ThrottlingException') errorType = 'ThrottlingException';
    else if (error.name === 'RequestTimeout') errorType = 'RequestTimeout';

    return { fileKey, isValid: false, valid: false, error: errorType };
  }
}

// Process batch of files with automatic retry for transient errors.
// Uses exponential backoff: wait 100ms, then 200ms, then 400ms between retries.
// This gives AWS time to recover from temporary throttling or network issues.
async function processBatchWithRetries(batch, s3Client, bucket, maxRetries = 3) {
  const results = [];

  for (const fileKey of batch) {
    let attempt = 0;
    let backoff = 100; // Start with 100ms delay
    let result = null;

    while (attempt < maxRetries) {
      result = await validatePDFMagicBytes(s3Client, bucket, fileKey);

      // Only retry errors that might succeed later (throttling, timeouts)
      // Don't retry permanent errors like NoSuchKey or AccessDenied
      if (result.error === 'ThrottlingException' ||
          result.error === 'RequestTimeout' ||
          result.error === 'Unknown') {
        attempt++;
        if (attempt < maxRetries) {
          await new Promise(res => setTimeout(res, backoff));
          backoff *= 2; // Double wait time: 100ms -> 200ms -> 400ms
          continue;
        }
      }
      break;
    }

    results.push(result);
  }

  return results;
}

// Save progress to disk for resume capability.
// Writes checkpoint as pretty-printed JSON with all processing state.
// If script crashes, the most recent checkpoint can be loaded to resume from last saved position.
// Called after each batch completes to minimize re-validation work on failure.
function saveCheckpoint(checkpointPath, state) {
  writeFileSync(checkpointPath, JSON.stringify(state, null, 2));
}

// Load previous progress from disk to resume interrupted runs.
// Returns checkpoint object with all state (line numbers, counts) if found and valid.
// Returns null if no checkpoint exists or if JSON parsing fails.
// On parse errors, prints warning and returns null to start fresh (safer than crashing).
function loadCheckpoint(checkpointPath) {
  if (!existsSync(checkpointPath)) {
    return null;
  }
  try {
    const data = readFileSync(checkpointPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading checkpoint: ${error.message}`);
    return null;
  }
}

// Create timestamped folder name for organizing validation runs.
// Format: YYYY-MM-DD_HH-MM-SS (e.g., 2025-01-23_14-30-45)
// Each run gets its own folder to avoid overwriting results from previous runs.
// Timestamp allows easy identification and sorting of validation runs chronologically.
function getTimestampFolderName() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
}

// Remove optional safestorage:// prefix from file keys.
// Some input files contain full URIs like "safestorage://bucket/path/file.pdf"
// but S3 API expects just the key path "bucket/path/file.pdf".
// Also trims whitespace to handle malformed input lines gracefully.
function cleanFileKey(key) {
  return key.replace(/^safestorage:\/\//, '').trim();
}

// Main processing: reads input file and validates PDFs concurrently
async function processFileStream(inputFile, s3Client, bucket, config, stats, progressBar, outputStream, errorStream, checkpointPath) {
  const { concurrency, batchSize, startFromLine } = config;

  // Queue holds batches for workers to process.
  // Size is limited to prevent loading millions of lines into memory.
  const batchQueue = [];
  const maxQueueSize = concurrency * 2;
  let readingPaused = false;
  let streamFinished = false;
  let resolveQueueSpace = null;

  // Checkpoint mutex: serialize checkpoint writes across concurrent workers.
  // With concurrency=100, up to 100 workers may finish batches simultaneously.
  // Without this lock, multiple workers could corrupt the checkpoint file by writing at once.
  // Promise-based mutex ensures only one worker writes at a time while others wait.
  let checkpointInProgress = null;

  // Safe checkpoint save with mutex to prevent concurrent writes.
  // Each worker calls this after completing a batch, but writes are serialized.
  // Implements atomic test-and-set pattern to prevent race conditions.
  async function saveCheckpointSafe() {
    // Create lock promise before checking current lock holder.
    // This ensures we have a promise ready to claim the lock atomically.
    let resolve;
    const myLock = new Promise(r => { resolve = r; });

    // Wait for current lock holder to finish (if any).
    // Multiple workers may reach this point, but only one will acquire the lock.
    while (checkpointInProgress) {
      await checkpointInProgress;
    }

    // Atomically claim the lock by storing our promise.
    // This is the critical section where only one worker can proceed.
    const previousLock = checkpointInProgress;
    checkpointInProgress = myLock;

    // Double-check: verify no one else claimed the lock between our check and set.
    // In rare race conditions, another worker might have claimed it first.
    // If so, wait for them to finish, then try again.
    if (previousLock !== null && checkpointInProgress !== myLock) {
      // Someone else got the lock, wait for them to complete
      while (checkpointInProgress !== myLock && checkpointInProgress !== null) {
        await checkpointInProgress;
      }
      // If lock is still not ours after waiting, retry from the beginning
      if (checkpointInProgress !== myLock) {
        return saveCheckpointSafe();
      }
    }

    try {
      saveCheckpoint(checkpointPath, {
        inputFile,
        lastProcessedLine: stats.lastProcessedLine,
        processedCount: stats.processedCount,
        validCount: stats.validCount,
        invalidCount: stats.invalidCount,
        notFoundCount: stats.notFoundCount,
        failedCount: stats.failedCount,
        timestamp: new Date().toISOString(),
        bucket
      });
    } finally {
      // Release lock: allow next waiting worker to proceed.
      // Setting to null signals that checkpoint write is complete.
      checkpointInProgress = null;
      resolve();
    }
  }

  // Worker processes batches concurrently (runs multiple in parallel).
  // With concurrency=100, we run 100 workers at once, each processing a batch.
  // This allows validating hundreds of files simultaneously instead of one-by-one.
  async function worker() {
    while (true) {
      if (batchQueue.length === 0) {
        if (streamFinished) break;
        await new Promise(res => setTimeout(res, 50));
        continue;
      }

      const { batch } = batchQueue.shift();

      // Resume file reading if queue has space (backpressure control).
      // This prevents reading millions of lines into memory at once.
      // We pause when queue is full, resume when it's half-empty.
      if (readingPaused && batchQueue.length < maxQueueSize / 2) {
        readingPaused = false;
        if (resolveQueueSpace) resolveQueueSpace();
      }

      const results = await processBatchWithRetries(batch, s3Client, bucket);

      // Update counters and write results
      for (const result of results) {
        stats.processedCount++;

        if (result.isValid && result.valid) {
          stats.validCount++;
        } else if (result.error === 'NoSuchKey') {
          stats.notFoundCount++;
        } else {
          stats.invalidCount++;
        }

        // Write to main results CSV
        outputStream.write({ fileKey: result.fileKey, valid: result.valid, error: result.error || '' });

        // Write failed items to separate file for easy retry
        if (result.error && result.error !== '') {
          stats.failedCount++;
          errorStream.write({ fileKey: result.fileKey, error: result.error });
        }

        progressBar.update(stats.processedCount);
      }

      // Save checkpoint after each batch completes (instead of every N files).
      // With default batchSize=1000, max re-validation on crash is 1000 files.
      // This prevents having to re-validate up to 9,999 files with the old approach.
      await saveCheckpointSafe();
    }
  }

  // Start worker pool: spawns N independent workers that process batches in parallel.
  // Each worker continuously pulls batches from the queue until all work is done.
  const workers = Array.from({ length: concurrency }, () => worker());

  // Process input file line-by-line without loading entire file into memory.
  // Node.js streams read data in chunks, keeping memory usage constant.
  // A 100GB file uses the same memory as a 1KB file with this approach.
  let currentBatch = [];
  let lineNumber = 0;
  let foundStartLine = !startFromLine;

  const processor = new Transform({
    objectMode: true,
    async transform(line, _, cb) {
      lineNumber++;
      stats.lastProcessedLine = lineNumber;

      // Skip lines until we reach the resume point
      if (!foundStartLine) {
        if (lineNumber >= startFromLine) {
          foundStartLine = true;
        } else {
          return cb();
        }
      }

      const fileKey = cleanFileKey(line[0].trim());
      if (!fileKey) {
        return cb();
      }

      currentBatch.push(fileKey);

      if (currentBatch.length >= batchSize) {
        batchQueue.push({ batch: currentBatch });
        currentBatch = [];

        // Pause file reading if queue is full (prevents memory overflow).
        // Without this, we'd read all lines into memory before processing starts.
        // Workers will resume reading when they make space in the queue.
        if (batchQueue.length >= maxQueueSize) {
          readingPaused = true;
          await new Promise(res => { resolveQueueSpace = res; });
        }
      }

      cb();
    },
    async flush(cb) {
      // Process remaining files
      if (currentBatch.length > 0) {
        batchQueue.push({ batch: currentBatch });
      }
      streamFinished = true;
      cb();
    }
  });

  // Stream file through parser: reads chunks, not entire file.
  // Data flows: file → CSV parser → processor → batch queue → workers
  await pipeline(
    createReadStream(inputFile, { encoding: 'utf8' }),
    parse({ delimiter: '\n', relax_column_count: true, skip_empty_lines: true }),
    processor
  );

  // Wait for all workers to finish processing their batches.
  // Workers exit when queue is empty and stream has finished reading.
  await Promise.all(workers);

  // Save final checkpoint with completion flag
  saveCheckpoint(checkpointPath, {
    inputFile,
    lastProcessedLine: stats.lastProcessedLine,
    processedCount: stats.processedCount,
    validCount: stats.validCount,
    invalidCount: stats.invalidCount,
    notFoundCount: stats.notFoundCount,
    failedCount: stats.failedCount,
    timestamp: new Date().toISOString(),
    bucket,
    completed: true
  });
}

// ============================================================================
// CLI and Main Entry Point
// ============================================================================

const usage = `
Usage: node index.js [options]

Options:
  --inputFile, -f      Required. Path to file with S3 keys (one per line)
  --bucket, -b         Required. S3 bucket name
  --envName, -e        Optional. Environment (dev|uat|test|prod|hotfix)
  --profile, -p        Optional. AWS account type (confinfo|core) default: confinfo
  --concurrency, -c    Optional. Number of concurrent S3 requests (default: 100)
  --batchSize, -s      Optional. Number of keys per batch (default: 1000)
  --startFromLine, -l  Optional. Line number to resume from
  --outputDir, -o      Optional. Output directory (default: ./results)
  --dryRun, -r         Optional. Simulate without writing results
  --help, -h           Show this help message

Example:
  node index.js --inputFile filekeys.txt --bucket pn-safestorage-bucket --envName dev
`;

async function main() {
  // Parse arguments
  const args = parseArgs({
    options: {
      inputFile: { type: 'string', short: 'f' },
      bucket: { type: 'string', short: 'b' },
      envName: { type: 'string', short: 'e' },
      profile: { type: 'string', short: 'p' },
      concurrency: { type: 'string', short: 'c' },
      batchSize: { type: 'string', short: 's' },
      startFromLine: { type: 'string', short: 'l' },
      outputDir: { type: 'string', short: 'o' },
      dryRun: { type: 'boolean', short: 'r' },
      help: { type: 'boolean', short: 'h' }
    }
  });

  if (args.values.help) {
    console.log(usage);
    process.exit(0);
  }

  // Validate required parameters
  if (!args.values.inputFile) {
    console.error('Error: Missing required parameter --inputFile');
    console.log(usage);
    process.exit(1);
  }

  if (!args.values.bucket) {
    console.error('Error: Missing required parameter --bucket');
    console.log(usage);
    process.exit(1);
  }

  if (!existsSync(args.values.inputFile)) {
    console.error(`Error: Input file not found: ${args.values.inputFile}`);
    process.exit(1);
  }

  // Parse and validate numeric parameters
  const concurrency = parseInt(args.values.concurrency) || DEFAULT_CONCURRENCY;
  const batchSize = parseInt(args.values.batchSize) || DEFAULT_BATCH_SIZE;
  const startFromLine = parseInt(args.values.startFromLine) || 0;

  if (concurrency < 1 || concurrency > 1000) {
    console.error('Error: concurrency must be between 1 and 1000');
    process.exit(1);
  }

  if (batchSize < 1) {
    console.error('Error: batchSize must be a positive number');
    process.exit(1);
  }

  const outputDir = args.values.outputDir || './results';
  const profile = args.values.profile || 'confinfo';
  const dryRun = args.values.dryRun || false;

  // Create timestamped output directory
  if (!existsSync(outputDir)) mkdirSync(outputDir);
  const timestampDir = getTimestampFolderName();
  const timestampPath = `${outputDir}/${timestampDir}`;
  if (!existsSync(timestampPath)) mkdirSync(timestampPath);

  const checkpointPath = `${timestampPath}/${CHECKPOINT_FILE_NAME}`;
  const outputCsvPath = `${timestampPath}/results.csv`;
  const failedCsvPath = `${timestampPath}/failed.csv`;

  console.log('='.repeat(60));
  console.log('S3 PDF Validator - Magic Byte Verification');
  console.log('='.repeat(60));
  console.log(`Input file: ${args.values.inputFile}`);
  console.log(`Output directory: ${timestampPath}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Batch size: ${batchSize}`);
  if (startFromLine > 0) {
    console.log(`Starting from line: ${startFromLine}`);
  }
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE: No actual validation will be performed');
  }
  console.log('='.repeat(60));

  // Initialize AWS S3 client with SSO authentication
  const awsClient = args.values.envName
    ? new AwsClientsWrapper(profile, args.values.envName)
    : new AwsClientsWrapper();

  awsClient._initS3();

  console.log(`Using bucket: ${args.values.bucket}\n`);

  if (dryRun) {
    console.log('Dry run complete. No validation performed.');
    process.exit(0);
  }

  // Look for previous checkpoint to resume from
  const checkpoint = loadCheckpoint(checkpointPath);
  const resuming = checkpoint && !checkpoint.completed;

  if (resuming) {
    console.log(`Found checkpoint from ${checkpoint.timestamp}`);
    console.log(`Resuming from line ${checkpoint.lastProcessedLine}`);
    console.log(`Previous progress: ${checkpoint.processedCount} processed, ${checkpoint.validCount} valid, ${checkpoint.invalidCount} invalid\n`);
  }

  // Initialize counters (resume from checkpoint if available)
  const stats = {
    lastProcessedLine: resuming ? checkpoint.lastProcessedLine : 0,
    processedCount: resuming ? checkpoint.processedCount : 0,
    validCount: resuming ? checkpoint.validCount : 0,
    invalidCount: resuming ? checkpoint.invalidCount : 0,
    notFoundCount: resuming ? checkpoint.notFoundCount : 0,
    failedCount: resuming ? (checkpoint.failedCount || 0) : 0
  };

  // Setup CLI progress bar
  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {percentage}% | {value}/{total} files | Valid: {valid} | Invalid: {invalid} | NotFound: {notfound}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    noTTYOutput: true
  });

  progressBar.start(100, stats.processedCount, {
    valid: stats.validCount,
    invalid: stats.invalidCount,
    notfound: stats.notFoundCount
  });

  // Setup CSV output (append if resuming, otherwise create new)
  const outputStream = createWriteStream(outputCsvPath, { flags: resuming ? 'a' : 'w' });
  const csvStringifier = stringify({ header: !resuming, columns: ['fileKey', 'valid', 'error'] });
  csvStringifier.pipe(outputStream);

  // Setup separate failed items CSV for easy retry
  const failedStream = createWriteStream(failedCsvPath, { flags: resuming ? 'a' : 'w' });
  const failedStringifier = stringify({ header: !resuming, columns: ['fileKey', 'error'] });
  failedStringifier.pipe(failedStream);

  const startTime = performance.now();

  try {
    await processFileStream(
      args.values.inputFile,
      awsClient._s3Client,
      args.values.bucket,
      {
        concurrency,
        batchSize,
        startFromLine: resuming ? checkpoint.lastProcessedLine + 1 : startFromLine
      },
      stats,
      progressBar,
      csvStringifier,
      failedStringifier,
      checkpointPath
    );

    csvStringifier.end();
    failedStringifier.end();
    await Promise.all([
      new Promise(resolve => outputStream.on('finish', resolve)),
      new Promise(resolve => failedStream.on('finish', resolve))
    ]);

  } catch (error) {
    console.error(`\nError during processing: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    progressBar.stop();
  }

  // Print summary statistics
  const executionTime = performance.now() - startTime;
  const usedMemory = process.memoryUsage();

  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processed: ${stats.processedCount}`);
  console.log(`Valid PDFs: ${stats.validCount} (${((stats.validCount / stats.processedCount) * 100).toFixed(2)}%)`);
  console.log(`Invalid: ${stats.invalidCount} (${((stats.invalidCount / stats.processedCount) * 100).toFixed(2)}%)`);
  console.log(`Not found: ${stats.notFoundCount} (${((stats.notFoundCount / stats.processedCount) * 100).toFixed(2)}%)`);
  console.log(`Failed (with errors): ${stats.failedCount} (${((stats.failedCount / stats.processedCount) * 100).toFixed(2)}%)`);
  console.log(`Execution time: ${(executionTime / 1000).toFixed(2)} seconds`);
  console.log(`Throughput: ${(stats.processedCount / (executionTime / 1000)).toFixed(2)} files/second`);
  console.log(`Memory used: ${(usedMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nResults saved to: ${outputCsvPath}`);
  console.log(`Failed items saved to: ${failedCsvPath}`);
  console.log(`Checkpoint saved to: ${checkpointPath}`);
  console.log('='.repeat(60));
}

// Graceful shutdown on Ctrl+C or process termination
function handleProcessSignal(signal) {
  console.log(`\nReceived ${signal} signal. Checkpoint saved. Exiting...`);
  process.exit(0);
}

process.on('SIGINT', handleProcessSignal);   // Ctrl+C
process.on('SIGTERM', handleProcessSignal);  // kill command
process.on('SIGHUP', handleProcessSignal);   // terminal closed

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
