package it.pagopa.pn.scripts.ecmetadata.checks;

import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

import java.nio.file.Path;
import java.nio.file.Paths;

@Command( name = "ecmetadata", subcommandsRepeatable = true, subcommands = {
        DoIndexingCommand.class,
        DoExportCommand.class
})
public class EcMetadataAnalisysMain {

    public static void main(String[] args) {
        int exitCode = doMain(args);
        System.exit( exitCode );
    }

    public static int doMain(String[] args) {
        return new CommandLine(new EcMetadataAnalisysMain()).execute(args);
    }


    @Option( names = {"--indexed-data-folder"})
    private Path indexedOutputFolder =  Paths.get( "./out/indexed" );
    public Path getIndexedOutputFolder() {
        return indexedOutputFolder;
    }

    @Option( names = {"--extracted-data-folder"})
    private Path extractionOutputFolder =  Paths.get( "./out/extraction" );
    public Path getExtractionOutputFolder() {
        return extractionOutputFolder;
    }

    @Option( names = {"--barchart-csv-file-name"})
    private String barCharDataCsvFileName =  "product_and_day__bar_chart__data.csv";
    public String getBarCharDataCsvFileName() {
        return barCharDataCsvFileName;
    }
}
