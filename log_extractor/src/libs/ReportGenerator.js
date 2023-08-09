const fs = require("fs");

class ReportGenerator {

  constructor() {}

  async generateReport( outputPath, env, result, format ) {
    switch (format) {
      case 'csv':
        await this._generateCSVLogFileResult( outputPath, env, result );
        break;
      case 'json':
        await this._generateJSONLogFileResult( outputPath, env, result );
    }
  }


  async _generateCSVLogFileResult( outputPath, env, result ) {
    const folder = outputPath + "/" + env + new Date().toISOString() 
    fs.mkdirSync(folder, { recursive: true })
    const csvContent = [];
    csvContent.push(Object.keys(result[0]).join(',')); // Intestazione

    result.forEach((item) => {
        const values = Object.values(item).map(value => `"${value}"`);
        csvContent.push(values.join(','));
    });

    // Convertire il contenuto CSV in una stringa
    const csvString = csvContent.join('\n');

    // Scrivere la stringa CSV in un file
    fs.writeFileSync(folder + '/output.csv', csvString, 'utf-8');

    console.log('File CSV creato con successo.');
  }

  async _generateJSONLogFileResult( outputPath, env, result ) {
    const folder = outputPath + "/" + env + new Date().toISOString() 
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(folder+'/output.json', JSON.stringify(result, null, 4), 'utf-8')
    console.log('File JSON creato con successo.');
  }
}




exports.ReportGenerator = ReportGenerator;
