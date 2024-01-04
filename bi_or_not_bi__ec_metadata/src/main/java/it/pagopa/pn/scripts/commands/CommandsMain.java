package it.pagopa.pn.scripts.commands;

import it.pagopa.pn.scripts.commands.datafixes.source_channel_details.SourceChannelDetailsRedoCommand;
import it.pagopa.pn.scripts.commands.exports.ec_metadata.EcRichiesteMetadatiExportCommand;
import it.pagopa.pn.scripts.commands.indexing.DoCdcIndexingCommand;
import it.pagopa.pn.scripts.commands.indexing.DynamoExportsIndexingCommand;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

import java.nio.file.Path;
import java.nio.file.Paths;

@Command( name = "ecmetadata", subcommandsRepeatable = true, subcommands = {
        DynamoExportsIndexingCommand.class,
        EcRichiesteMetadatiExportCommand.class,
        DoCdcIndexingCommand.class,
        SourceChannelDetailsRedoCommand.class
})
public class CommandsMain {

    public static final String EC_METADATA_TABLE_NAME = "pn-EcRichiesteMetadati";

    public static void main(String[] args) {
        int exitCode = doMain(args);
        System.exit( exitCode );
    }

    public static int doMain(String[] args) {
        return new CommandLine(new CommandsMain()).execute(args);
    }


    @Option( names = {"--dynexp-indexed-data-folder"})
    private Path dynamoExportsIndexedOutputFolder =  Paths.get( "./out/indexed/dynexp" );
    public Path getDynamoExportsIndexedOutputFolder() {
        return dynamoExportsIndexedOutputFolder;
    }

    public Path getEcMetadataIndexedOutputFolder() {
        return getDynamoExportsIndexedOutputFolder().resolve(EC_METADATA_TABLE_NAME);
    }

    @Option( names = {"--cdc-indexed-data-folder"})
    private Path cdcIndexedOutputFolder =  Paths.get( "./out/indexed/cdc" );
    public Path getCdcIndexedOutputFolder() {
        return cdcIndexedOutputFolder;
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
