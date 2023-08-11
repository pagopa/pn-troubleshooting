const fs = require("fs");

class ReportGenerator {

  constructor() {}

  async generateReport( outputPath, env, result, format ) {
    const timestamp = new Date().toISOString() 
    console.log(JSON.stringify(result))
    switch (format) {
      case 'csv':
        if(result.hasOwnProperty("logs")) {
          await this._generateCSVLogFileResult( outputPath, timestamp, env, result.logs, "logs" );
        }
        if(result.hasOwnProperty("trace_ids")){
          if(result.trace_ids.length > 0){
            await this._generateJSONLogFileResult( outputPath, timestamp, env, result.trace_ids, "trace_ids" );
          }
          console.log("N° " + result.trace_ids.length + " trace ids to examine.")
        }
        break;
      case 'json':
        await this._generateJSONLogFileResult( outputPath, timestamp, env, result, "output" );
        break;
    }
  }


  async _generateCSVLogFileResult( outputPath, timestamp, env, result, filename ) {
    const folder = outputPath + "/" + env + timestamp 
    fs.mkdirSync(folder, { recursive: true })
    const csvContent = [];
    csvContent.push(Object.keys(result[0]).join('|')); // Intestazione

    result.forEach((item) => {
        const values = Object.values(item).map(value => `"${value}"`);
        csvContent.push(values.join('|'));
    });

    // Convertire il contenuto CSV in una stringa
    const csvString = csvContent.join('\n');

    // Scrivere la stringa CSV in un file
    fs.writeFileSync(folder + '/' + filename + '.csv', csvString, 'utf-8');

    console.log('File CSV ' + filename + '.csv creato con successo.');
  }

  async _generateJSONLogFileResult( outputPath, timestamp, env, result, filename ) {
    const folder = outputPath + "/" + env + timestamp 
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(folder+'/'+filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
    console.log('File JSON '+filename + '.json creato con successo.');
  }
}




exports.ReportGenerator = ReportGenerator;
