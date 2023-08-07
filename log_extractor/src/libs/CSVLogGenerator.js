const fs = require("fs");

class CSVLogGenerator {

  constructor() {}

  async generateCSV( outputPath, env, result ) {
    await this._generateLogFileResult( outputPath, env, result );
  }


  async _generateLogFileResult( outputPath, env, result ) {
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
}


exports.CSVLogGenerator = CSVLogGenerator;
