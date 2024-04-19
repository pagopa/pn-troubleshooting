package it.pagopa.pn.scripts.commands.exports.ec_metadata;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.exports.ec_metadata.seq.RawEventSequence;
import it.pagopa.pn.scripts.commands.exports.ec_metadata.seq.SequenceSummaryParser;
import it.pagopa.pn.scripts.commands.exports.ec_metadata.seq.SequenceTree;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import picocli.CommandLine.Option;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static it.pagopa.pn.scripts.commands.utils.PathsUtils.cleanFolder;

@Command(name = "exportEcRichiesteMetadati")
public class EcRichiesteMetadatiExportCommand implements Callable<Integer> {

    public static final String EXPORT_QUERIES_RESOURCE = "export_EcRichiesteMetadati_queries.sql";


    @Option( names = {"--categorized-sequences-tree-path"})
    private Path categorizedSequencesTreePath = Paths.get("sequence_tree.json");

    @Option( names = {"--file-min-rows"})
    private int minRows = 70 * 1000;

    @Option( names = {"--file-max-rows"})
    private int maxRows = 120 * 1000;

    @ParentCommand
    CommandsMain parent;

    @Override
    public Integer call() throws Exception {

        // - Load queries from sql file
        SqlQueryMap queries = SqlQueryMap.fromClasspathResource( EXPORT_QUERIES_RESOURCE );

        // - exported data aggregator
        EcRichiesteMetadatiExportDayAggregator extractionPolicy = new EcRichiesteMetadatiExportDayAggregator( minRows, maxRows );

        // - Load sequences manual classification
        SequenceTree categorizedSequencesTree = SequenceTree.loadFromJson( categorizedSequencesTreePath );
        List<RawEventSequence> categorizedSequences = categorizedSequencesTree.getSequences();

        // - Start spark
        MsgListenerImpl logger = new MsgListenerImpl();
        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore("Export EcMetadata");
        spark.addListener( logger );

        // - Send manual sequence classification to spark
        spark.temporaryTableFromBeanCollection( "categorized_sequences", categorizedSequences, RawEventSequence.class);


        // - Clean export folder
        Path extractionOutputFolder = parent.getExtractionOutputFolder();
        cleanFolder( extractionOutputFolder );

        // - Read indexed data
        spark.readParquetTable( parent.getEcMetadataIndexedOutputFolder(), "ec_metadata__fromfile" );
        spark.readParquetTable( parent.getCdcIndexedOutputFolder().resolve("pn-Timelines"), "timelines" );

        // - Execute all queries present in SQL file
        for( String queryName: queries.getQueriesNames() ) {
            String sqlQuery = queries.getQuery(queryName).getSqlQuery();
            System.out.println( "############## EXECUTE QUERY " + queryName);
            System.out.println( sqlQuery );

            spark.execSql(sqlQuery);
        }

        // - Export sequence summary
        Path extractionSequenceSummary = extractionOutputFolder.resolve("summary.csv");
        spark.tableToCsvSingleFile(
                "cardinality_by_product_and_sequence",
                extractionSequenceSummary
        );

        // - Write sequenceses tree
        List<RawEventSequence> seqs = SequenceSummaryParser.loadSequences( extractionSequenceSummary );
        for( RawEventSequence seq: seqs ) {
            categorizedSequencesTree.addSequence( seq );
        }
        categorizedSequencesTree.writeToJson( categorizedSequencesTreePath );

        // - Export to parquet
        spark.writeTableToParquet(
                "all_paper_metadata_with_synthetic_select_list",
                extractionOutputFolder.resolve("parquet")
        );

        // - Used saved parquet as a materialized view
        spark.readParquetTable(
                extractionOutputFolder.resolve("parquet"),
                "all_paper_metadata_with_synthetic_select_list"
            );


        // - Compute product and day cardinality; usefull for export aggregation
        Map<String, List<EcRichiesteMetadatiExportDayAggregator.CardinalityByProductAndDayRow>> daySummaries = spark
                .tableToBeanStream(
                        "cardinality_by_product_and_day",
                        EcRichiesteMetadatiExportDayAggregator.CardinalityByProductAndDayRow.class
                )
                .collect(Collectors.groupingBy(
                        EcRichiesteMetadatiExportDayAggregator.CardinalityByProductAndDayRow::getPaperMeta_productType
                ));


        // - Decide which extraction have to do. Balancing number of files and file dimension
        Map<String, List<EcRichiesteMetadatiExportDayAggregator.ExtractionInterval>> extractionsByProduct;
        extractionsByProduct = extractionPolicy.computeExtractionsListFromSummary(daySummaries);

        // - Do exports
        EcRichiesteMetadatiExportJobFactory jobFactory = EcRichiesteMetadatiExportJobFactory
                  .newInstance( spark, extractionOutputFolder, parent.getBarCharDataCsvFileName() );

        for( String product: extractionsByProduct.keySet() ) {
            for( EcRichiesteMetadatiExportDayAggregator.ExtractionInterval extraction:
                    extractionsByProduct.get( product )) {
                String fromDay = extraction.getFrom();
                String toDay = extraction.getTo();
                String jobName = product + " [" + fromDay + ", " + toDay + "]";

                Runnable job = jobFactory.extractionJob( product, fromDay, toDay );
                spark.addJob( jobName, job);
            }
        }

        spark.addJob("BarChart", jobFactory.newBarChartDataExtractionJob());

        // - Wait scheduled jobs
        spark.shutdown( 1, TimeUnit.HOURS );
        return 0;
    }


}
