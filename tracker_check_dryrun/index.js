/*
Script per verificare la corrispondenza tra gli eventi analogici della timeline e gli output dry-run di pn-paper-tracker.

Uso:
  CORE_AWS_PROFILE=sso_pn-core-dev REGION=eu-south-1 INPUT_FILE=./input.csv node index.js

Variabili d'ambiente:
  - CORE_AWS_PROFILE: profilo AWS da usare
  - REGION: regione AWS (default: eu-south-1)
  - INPUT_FILE: percorso del file csv conteneente gli attemptId da controllare (default: ./input.csv)
  - SAVE_JSON: se impostato a "true", salva i file json di output della timeline, dry-run ed il confronto

Output:
  - out/report.csv: report csv con eventuali errori di tracking
  - out/timeline_<attemptId>.json: elementi della timeline letti da DynamoDB
  - out/dryrun_<attemptId>.json: output dry run letti da DynamoDB
  - out/trackingErrors_<attemptId>.json: output dry run letti da DynamoDB
  - out/comparison_<attemptId>.json: report di confronto tra timeline e dry run
*/

import { main } from './src/main.js';

await main();