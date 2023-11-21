package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.ecmetadata.checks.s3client.S3FileLister;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.RawEventSequence;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.SequenceTree;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SqlQueryMap;
import picocli.CommandLine;
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


    @Option( names = {"--extracted-data-folder"})
    private Path extractionOutputFolder =  Paths.get( "./out/extraction" );

    @Option( names = {"--categorized-sequences-tree-path"})
    private Path categorizedSequencesTreePath = Paths.get("out/sequence_tree.json");

    @Option( names = {"--file-min-rows"})
    private int minRows = 70 * 1000;

    @Option( names = {"--file-max-rows"})
    private int maxRows = 120 * 1000;

    @ParentCommand
    EcMetadataAnalisysMain parent;

    @Override
    public Integer call() throws Exception {

        SqlQueryMap queries = SqlQueryMap.fromClasspathResource( EXPORT_QUERIES_RESOURCE );
        ExtractorDayAggregator extractionPolicy = new ExtractorDayAggregator( minRows, maxRows );

        SequenceTree categorizedSequencesTree = SequenceTree.loadFromJson( categorizedSequencesTreePath );
        List<RawEventSequence> categorizedSequences = categorizedSequencesTree.getSequences();

        MsgListenerImpl logger = new MsgListenerImpl();
        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore("Export EcMetadata");
        spark.addListener( logger );

        spark.temporaryTableFromBeanCollection( "categorized_sequences", categorizedSequences, RawEventSequence.class);

        cleanFolder( extractionOutputFolder );

        spark.readParquetTable( parent.getIndexedOutputFolder(), "ec_metadta__fromfile" );

        for( String queryName: queries.getQueriesNames() ) {
            String sqlQuery = queries.getQuery(queryName);
            System.out.println( "############## EXECUTE QUERY " + queryName);
            System.out.println( sqlQuery );

            spark.execSql(sqlQuery);
        }

        spark.tableToCsvSingleFile(
                "cardinality_by_product_and_sequence",
                extractionOutputFolder.resolve("summary.csv")
        );



        Map<String, List<ExtractorDayAggregator.CardinalityByProductAndDayRow>> daySummaries = spark
                .tableToBeanStream(
                        "cardinality_by_product_and_day",
                        ExtractorDayAggregator.CardinalityByProductAndDayRow.class
                )
                .collect(Collectors.groupingBy(
                        ExtractorDayAggregator.CardinalityByProductAndDayRow::getPaperMeta_productType
                ));


        Map<String, List<ExtractorDayAggregator.ExtractionInterval>> extractionsByProduct;
        extractionsByProduct = extractionPolicy.computeExtractionsListFromSummary(daySummaries);


        ExtractorJobFactory jobFactory = ExtractorJobFactory.newInstance( spark, extractionOutputFolder );

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

        spark.shutdown( 1, TimeUnit.HOURS );
        return 0;
    }
}
