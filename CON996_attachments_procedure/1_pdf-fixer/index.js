const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const fsAsync = require('fs');
const { AwsClientsWrapper } = require('./aws');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

if(process.argv.length < 7){
    console.error('Usage: node index.js <input-file> <aws-account-id> <env> <margin-percentage> <dpi>');
    process.exit(1);
}

const awsClient = new AwsClientsWrapper(process.argv[4]);

async function scaleContent(inputPath, outputPath, scalePercentage) {
    // Read the PDF file
    const pdfBytes = await fs.readFile(inputPath);

    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get the first page of the PDF
    const pages = pdfDoc.getPages();

    // Iterate through each page and scale down the content
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        const widthPosition = width * scalePercentage / 100;
        const heightPosition = height * scalePercentage / 100;

        // Calculate scaling factors
        const scalingFactorX = 1 - (scalePercentage / 100);
        const scalingFactorY = 1 - (scalePercentage / 100);

        // Scale content
        page.scaleContent(scalingFactorX, scalingFactorY);

        page.translateContent(widthPosition/2, heightPosition/2);
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Write the modified PDF to a file
    await fs.writeFile(outputPath, modifiedPdfBytes);
}

async function reduceMargins(inputPath, outputPath, marginPercentage) {
    // Read the PDF file
    const pdfBytes = await fs.readFile(inputPath);

    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get the first page of the PDF
    const pages = pdfDoc.getPages();

    // Iterate through each page and reduce margins
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        // Calculate margin reduction values
        const marginReduction = width * (marginPercentage / 100);
        const marginX = marginReduction / 2; // Half of the total reduction

        const marginYReduction = height * (marginPercentage / 100);
        const marginY = marginYReduction / 2;

        const mediaBox = page.getMediaBox();
        console.log(mediaBox);
        // Reduce left and right margins equally
        page.setMediaBox(-marginX, -marginY, width, height);
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Write the modified PDF to a file
    await fs.writeFile(outputPath, modifiedPdfBytes);
}

const marginPercentage = 10; // 10% reduction in left and right margins
const scalePercentage = parseInt(process.argv[5]);

async function fixPdf(inputPath, outputPath, scalePercentage) {
    //await printToPdf(inputPath, outputPath);
    await scaleContent(inputPath, outputPath, scalePercentage);
    //await reduceMargins(outputPath, outputPath, marginPercentage);
}

async function downloadFileFromS3(fileKey, bucket, outputPath){
    const response = await awsClient.downloadObject(bucket, fileKey);
    await fs.writeFile(outputPath, response.Body);
}

async function printToPdf(inputFilePath){
    const inputFileName = inputFilePath.split('/').pop();
    const dpi = parseInt(process.argv[6])
    const gsParams = '-dNOPAUSE -dBATCH -sDEVICE=pngalpha -r'+dpi+' -sOutputFile=pngs/'+inputFileName+'-%03d.png'

    // execute ghostscript
    const { stdout, stderr } = await exec('gs '+gsParams+' '+inputFilePath);
    console.log('stdout:', stdout);
    console.log('stderr:', stderr);

    // convert pngs to pdf
    const { stdout2, stderr2 } = await exec('convert pngs/'+inputFileName+'*.png outputs/printed_'+inputFileName);
    console.log('stdout2:', stdout2);
    console.log('stderr2:', stderr2);

    return 'outputs/printed_'+inputFileName
}

const bucket = 'pn-safestorage-eu-south-1-'+process.argv[3]

const report = {}
async function run(){

    const file = await fs.readFile(process.argv[2], 'utf-8');
    console.log('file read', file)
    const jsonLines = file.split("\n").filter((l) => l!='');

    const fileKeys = []

    for(let i=0; i<jsonLines.length; i++){
        const line = JSON.parse(jsonLines[i])
        // append to fileKeys line.attachments
        for(let j=0; j<line.attachments.length; j++){
            fileKeys.push(line.attachments[j]);
        }
    }

    await fs.mkdir('inputs', { recursive: true });
    await fs.mkdir('pngs', { recursive: true })
    await fs.mkdir('outputs', { recursive: true });
    for(let i=0; i<fileKeys.length; i++){
        const fileKeyToUseAsIndex = fileKey
        const fileKey = fileKeyToUseAsIndex.split('?')[0] // remove '?docDat' from fileKey
        // check if file exists in output folder
        const outputExists = fsAsync.existsSync('outputs/printed_fixed_'+fileKey);
        if(outputExists){
            console.log('file '+fileKey+' already fixed');
            report[fileKey] = 'outputs/printed_fixed_'+fileKey;
            continue;
        }

        const outputPath = `inputs/${fileKey}`;
        const fixedOutputPath = `outputs/fixed_${fileKey}`;
        await downloadFileFromS3(fileKey, bucket, outputPath);
        await fixPdf(outputPath, fixedOutputPath, scalePercentage);
        console.log('fixed '+fileKey+' and saved to '+fixedOutputPath);

        const printedFixedOutputPath = await printToPdf(fixedOutputPath);
        console.log(fileKey+' printed to pdf: '+printedFixedOutputPath);
        report[fileKeyToUseAsIndex] = printedFixedOutputPath;
    }
}

run().then(
    () => console.log('done'))
    .catch(console.error)
    .finally(() => {
        fs.writeFile('report.json', JSON.stringify(report, null, 2))
    })

