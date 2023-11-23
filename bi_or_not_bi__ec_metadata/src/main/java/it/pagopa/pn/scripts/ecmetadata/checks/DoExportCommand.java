package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.RawEventSequence;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.SequenceSummaryParser;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.SequenceTree;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SqlQueryMap;
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

import static it.pagopa.pn.scripts.ecmetadata.checks.utils.PathsUtils.cleanFolder;

@Command(name = "export")
class DoExportCommand implements Callable<Integer> {

    public static final String EXPORT_QUERIES_RESOURCE = "export_queries.sql";


    @Option( names = {"--categorized-sequences-tree-path"})
    private Path categorizedSequencesTreePath = Paths.get("sequence_tree.json");

    @Option( names = {"--file-min-rows"})
    private int minRows = 70 * 1000;

    @Option( names = {"--file-max-rows"})
    private int maxRows = 120 * 1000;

    @ParentCommand
    EcMetadataAnalisysMain parent;

    @Override
    public Integer call() throws Exception {

        // - Load queries from sql file
        SqlQueryMap queries = SqlQueryMap.fromClasspathResource( EXPORT_QUERIES_RESOURCE );

        // - exported data aggregator
        ExtractorDayAggregator extractionPolicy = new ExtractorDayAggregator( minRows, maxRows );

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
        spark.readParquetTable( parent.getIndexedOutputFolder(), "ec_metadta__fromfile" );

        // - Execute all queries present in SQL file
        for( String queryName: queries.getQueriesNames() ) {
            String sqlQuery = queries.getQuery(queryName);
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


        // - Compute product and day cardinality; usefull for export aggregation
        Map<String, List<ExtractorDayAggregator.CardinalityByProductAndDayRow>> daySummaries = spark
                .tableToBeanStream(
                        "cardinality_by_product_and_day",
                        ExtractorDayAggregator.CardinalityByProductAndDayRow.class
                )
                .collect(Collectors.groupingBy(
                        ExtractorDayAggregator.CardinalityByProductAndDayRow::getPaperMeta_productType
                ));


        // - Decide which extraction have to do. Balancing number of files and file dimension
        Map<String, List<ExtractorDayAggregator.ExtractionInterval>> extractionsByProduct;
        extractionsByProduct = extractionPolicy.computeExtractionsListFromSummary(daySummaries);

        // - Export to parquet
        spark.writeTableToParquet(
                "all_paper_metadata_with_synthetic_select_list",
                extractionOutputFolder.resolve("parquet")
            );

        // - Do exports
        ExtractorJobFactory jobFactory = ExtractorJobFactory
                  .newInstance( spark, extractionOutputFolder, parent.getBarCharDataCsvFileName() );

        for( String product: extractionsByProduct.keySet() ) {
            for( ExtractorDayAggregator.ExtractionInterval extraction:
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
