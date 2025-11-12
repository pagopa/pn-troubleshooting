# paper-tracker-check-dryrun

Script per verificare la corrispondenza tra gli eventi analogici della timeline e gli output dry-run di pn-paper-tracker.

```
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
```

## Struttura file CSV
```CSV
"IUN","attemptId","nPcRetry","registeredLetterCode"
"LRNM-ZNDM-JYLN-202510-U-1","PREPARE_ANALOG_DOMICILE.IUN_LRNM-ZNDM-JYLN-202510-U-1.RECINDEX_0.ATTEMPT_0","1","230eeb8ab5fc4dc59eaaab87ab23a3e4"
"ZYDQ-VEKN-WZDW-202510-V-1","PREPARE_ANALOG_DOMICILE.IUN_ZYDQ-VEKN-WZDW-202510-V-1.RECINDEX_0.ATTEMPT_0","2","230eeb8ab5fc4dc59eaaab87ab23a3e4"
```

## Query Athena
```SQL
WITH trackings AS (
    SELECT *
    FROM "pn_paper_trackings_json_view"
    WHERE p_year = '2025'
      AND (
            (p_month = '10' AND CAST(p_day AS INT) BETWEEN 27 AND 31)
         OR (p_month = '11' AND CAST(p_day AS INT) BETWEEN 1 AND 2)
          )
),
latest_trackings AS (
    SELECT
        t.*,
        ROW_NUMBER() OVER (PARTITION BY trackingId ORDER BY updatedAt DESC) AS rn
    FROM trackings t
),
end_state_trackings AS (
    SELECT lt.*
    FROM latest_trackings lt
    WHERE rn = 1 AND (state = 'KO' OR state = 'DONE')
),
trackings_with_iuns AS (
    SELECT
        *,
        regexp_extract(trackingId, 'IUN_([^.]+)', 1) AS IUN
    FROM end_state_trackings
)
SELECT DISTINCT IUN, attemptId, COUNT(*) AS nPcRetry, paperStatus_registeredLetterCode AS registeredLetterCode
FROM trackings_with_iuns
GROUP BY IUN, attemptId, paperStatus_registeredLetterCode;
```