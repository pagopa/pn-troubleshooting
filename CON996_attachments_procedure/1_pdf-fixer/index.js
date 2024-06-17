const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const { AwsClientsWrapper } = require('./aws');

if(process.argv.length < 5){
    console.error('Usage: node index.js <input-file> <aws-account-id> <env>');
    process.exit(1);
}

const awsClient = new AwsClientsWrapper(process.argv[4]);

async function printToPdf(originalPdfPath, newPdfPath) {
    // Load the original PDF
    const originalPdfBytes = await fs.readFile(originalPdfPath);
    const originalPdfDoc = await PDFDocument.load(originalPdfBytes);
  
    // Create a new blank PDF
    const newPdfDoc = await PDFDocument.create();
  
    // Copy each page from the original PDF to the new PDF
    const numPages = originalPdfDoc.getPageCount();
    for (let i = 0; i < numPages; i++) {
      const [copiedPage] = await newPdfDoc.copyPages(originalPdfDoc, [i]);
      newPdfDoc.addPage(copiedPage);
    }
  
    // Remove all content from the copied pages
    /*newPdfDoc.getPages().forEach(page => {
      page.node.set('Contents', newPdfDoc.context.obj([]));
    });*/
  
    // Save the new PDF
    const newPdfBytes = await newPdfDoc.save();
    await fs.writeFile(newPdfPath, newPdfBytes);
}

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
const scalePercentage = 20;

async function fixPdf(inputPath, outputPath, marginPercentage, scalePercentage) {
    //await printToPdf(inputPath, outputPath);
    await scaleContent(inputPath, outputPath, scalePercentage);
    //await reduceMargins(outputPath, outputPath, marginPercentage);
}

async function downloadFileFromS3(fileKey, bucket, outputPath){
    const response = await awsClient.downloadObject(bucket, fileKey);
    await fs.writeFile(outputPath, response.Body);
}


const bucket = 'pn-safestorage-eu-south-1-'+process.argv[3]

const report = {}
async function run(){

    const file = await fs.readFile(process.argv[2], 'utf-8');
    console.log('file read', file)
    const jsonLines = file.split("\n");

    const fileKeys = []

    for(let i=0; i<jsonLines.length; i++){
        const line = JSON.parse(jsonLines[i])
        // append to fileKeys line.attachments
        for(let j=0; j<line.attachments.length; j++){
            fileKeys.push(line.attachments[j]);
        }
    }

    await fs.mkdir('inputs', { recursive: true });
    await fs.mkdir('outputs', { recursive: true });
    for(let i=0; i<fileKeys.length; i++){
        const fileKey = fileKeys[i];
        const outputPath = `inputs/${fileKey}`;
        const fixedOutputPath = `outputs/fixed_${fileKey}`;
        await downloadFileFromS3(fileKey, bucket, outputPath);
        await fixPdf(outputPath, fixedOutputPath, marginPercentage, scalePercentage);
        console.log('fixed '+fileKey+' and saved to '+fixedOutputPath);

        report[fileKey] = fixedOutputPath;
    }

    await fs.writeFile('report.json', JSON.stringify(report));
}

run().then(() => console.log('done')).catch(console.error);

