const fs = require('fs');
const ExcelJS = require('exceljs');
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require("@aws-sdk/client-cloudwatch-logs");


// Inizializza il client CloudWatch Logs (cambia la regione se necessario)
const client = new CloudWatchLogsClient({profile: process.argv[2],  region: "eu-south-1" });

// Range temporale: dal 16 00:00 del mese precedente al 17 00:00 del mese corrente
const now = new Date();
const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 16, 23, 59, 59, 0));
const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 17, 0, 0, 0, 0));
const startSeconds = Math.floor(startDate.getTime() / 1000);
const endSeconds = Math.floor(endDate.getTime() / 1000);

const outputFilename = `Report_KPI_LogInsight-${startDate.toUTCString()}-${endDate.toUTCString()}.xlsx`;

// Definizione dei KPI, delle query e dei relativi tab Excel
const kpiConfigs = [
    {
        sheetName: "KP1 - Accessi Generali",
        logGroupName: "/aws/ecs/pn-delivery",
        queryString: `filter source_channel = "IO" and source_channel_details = "QR_CODE" and level="INFO" and aud_type like /AUD_NT_VIEW/ and @message not like /BEFORE/ | fields coalesce(mandate_workflow_type, "DIRETTO") as TipoAccesso | stats count() as Accessi by TipoAccesso`
    },
    {
        sheetName: "KP1 - Delegati Ripetuti",
        logGroupName: "/aws/ecs/pn-delivery",
        queryString: `filter source_channel = "IO" and source_channel_details = "QR_CODE" and aud_type = "AUD_NT_VIEW_DEL" and mandate_workflow_type = "CIE" and level="INFO" and message like /SUCCESS/ | stats count(*) as Accessi by cx_id as Delegato | filter Accessi > 10 | sort Accessi desc`
    },
    {
        sheetName: "KP2 - Tasso Successo",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and message not like /BEFORE/ | fields if(level == "INFO", "SUCCESS", if(level == "ERROR", "FAIL", level)) as Esito | stats count(*) as Numero by mandate_workflow_type, Esito | sort Esito desc`
    },
    {
        sheetName: "KP3 - Distribuzione Deleghe",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and level="INFO" and message not like /BEFORE/ | stats count(*) as Numero by cx_id as Delegato, delegator_id as Delegante | filter Numero > 10 | sort Numero desc`
    },
    {
        sheetName: "KP3 - Sospetto Fallimenti",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and level="ERROR" and message not like /BEFORE/ | stats count(*) as Fallimenti by cx_id as Delegato | filter Fallimenti > 10 | sort Fallimenti desc`
    },
    {
        sheetName: "KP3 - Sospetto per Soggetto",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and level="INFO" and message like /SUCCESS/ | stats count(*) as Accessi by cx_id as Delegato | filter Accessi > 10 | sort Accessi desc`
    },
    {
        sheetName: "KP6 - Errori Validazione",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and level="ERROR" | stats count(*) as NumeroErrori by error_category as CategoriaDiErrore | sort NumeroErrori, CategoriadiErrore desc`
    },
    {
        sheetName: "Top Delegati",
        logGroupName: "/aws/ecs/pn-mandate",
        queryString: `filter source_channel = "IO" and aud_type = "AUD_DL_ACCEPT" and mandate_workflow_type = "CIE" and level="INFO" and @message not like /BEFORE/ | stats count_distinct(delegator_id) as DelegantiUnici, count_distinct(iun) as IUNUnici by cx_id as Delegato | sort DelegantiUnici desc | limit 10`
    }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runPipeline() {
    console.log("🚀 Avvio della pipeline unificata (CloudWatch -> Excel)...");
    
    // Inizializza il Workbook Excel
    const workbook = new ExcelJS.Workbook();
    let processedSheetsCount = 0;

    for (const kpi of kpiConfigs) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📡 Lancio query CloudWatch per il tab: [ ${kpi.sheetName} ]`);
        
        try {
            // 1. Avvia la query asincrona su CloudWatch Logs Insights
            const startCommand = new StartQueryCommand({
                logGroupName: kpi.logGroupName,
                startTime: startSeconds,
                endTime: endSeconds,
                queryString: kpi.queryString,
                limit: 50 // Ottimizzato per massimo 50 righe come richiesto
            });
            
            const startResponse = await client.send(startCommand);
            const queryId = startResponse.queryId;
            console.log(`🆔 Query ID: ${queryId}. Eseguo il polling dei risultati...`);

            // 2. Polling per attendere il completamento della query
            let status = "Running";
            let queryResults;
            
            while (status === "Running" || status === "Scheduled") {
                await delay(2000); // Attende 2 secondi prima del controllo successivo
                const resultsCommand = new GetQueryResultsCommand({ queryId });
                queryResults = await client.send(resultsCommand);
                status = queryResults.status;
            }

            if (status !== "Complete") {
                console.error(`❌ La query si è interrotta con stato imprevisto: ${status}`);
                continue;
            }

            const rawRecords = queryResults.results;
            if (!rawRecords || rawRecords.length === 0) {
                console.log(`⚠️  Nessun dato restituito da CloudWatch. Salto la creazione del tab.`);
                continue;
            }

            console.log(`📊 Ricevute ${rawRecords.length} righe. Generazione tab Excel in memoria...`);

            // 3. Creazione del foglio di lavoro Excel
            const worksheet = workbook.addWorksheet(kpi.sheetName, {
                views: [{ showGridLines: true }] // Mantiene visibile la griglia classica di Excel
            });

            // Estrazione dinamica degli header puliti (rimuovendo i metadati interni @ptr di AWS)
            const headers = rawRecords[0].map(item => item.field).filter(h => h !== '@ptr');
            worksheet.columns = headers.map(h => ({ header: h, key: h }));

            // Mappatura e inserimento dei record direttamente nel foglio Excel
            rawRecords.forEach(row => {
                const formattedRecord = {};
                headers.forEach(header => {
                    const fieldObj = row.find(item => item.field === header);
                    let val = fieldObj ? fieldObj.value : "";
                    
                    // Conversione sul volo: se la stringa è puramente numerica, la scrive come Number
                    if (val !== "" && !isNaN(val)) {
                        formattedRecord[header] = Number(val);
                    } else {
                        formattedRecord[header] = val;
                    }
                });
                worksheet.addRow(formattedRecord);
            });

            // --- STILIZZAZIONE GRAFICA AVANZATA ---
            
            // Stile Intestazione (Riga 1)
            const headerRow = worksheet.getRow(1);
            headerRow.height = 24;
            headerRow.eachCell((cell) => {
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E78' } }; // Blu Istituzionale
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            // Stile Righe Dati e Allineamento intelligente
            worksheet.eachRow({ includeHeader: false }, (row) => {
                row.height = 20;
                row.eachCell((cell) => {
                    cell.font = { name: 'Calibri', size: 11 };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'D9D9D9' } },
                        left: { style: 'thin', color: { argb: 'D9D9D9' } },
                        bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
                        right: { style: 'thin', color: { argb: 'D9D9D9' } }
                    };

                    // Allinea a destra i valori numerici, a sinistra le stringhe/ID
                    if (typeof cell.value === 'number') {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    } else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                });
            });

            // Auto-adattamento dinamico della larghezza delle colonne
            worksheet.columns.forEach(column => {
                let maxLength = column.header.length;
                column.eachCell({ includeHeader: false }, cell => {
                    const cellLength = cell.value ? String(cell.value).length : 0;
                    if (cellLength > maxLength) {
                        maxLength = cellLength;
                    }
                });
                column.width = maxLength < 12 ? 14 : maxLength + 4;
            });

            processedSheetsCount++;
            console.log(`✅ Tab '${kpi.sheetName}' completato e pronto in memoria.`);

        } catch (error) {
            console.error(`💥 Errore durante l'elaborazione del KPI [ ${kpi.sheetName} ]:`, error.message);
        }
    }

    // 4. Scrittura finale del file Excel su disco
    if (processedSheetsCount > 0) {
        await workbook.xlsx.writeFile(outputFilename);
        console.log(`\n==================================================`);
        console.log(`🎉 Operazione completata! Report generato: '${outputFilename}'`);
        console.log(`==================================================`);
    } else {
        console.error("\n❌ Errore: Nessun dato estratto, file Excel non generato.");
    }
}


runPipeline().catch(err => console.error("💥 Errore fatale nella pipeline:", err));
