package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.ecmetadata.checks.s3client.S3FileLister;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SqlQueryMap;
import org.apache.commons.io.IOUtils;
import org.apache.spark.sql.SQLContext;
import org.apache.spark.sql.SparkSession;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import org.jetbrains.annotations.NotNull;
import org.testng.annotations.Test;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.ecmetadata.checks.utils.PathsUtils.cleanFolder;
import static it.pagopa.pn.scripts.ecmetadata.checks.utils.StreamUtils.*;

public class S3FileListerTest {

    public static final String INDEXING_QUERIES_RESOURCE = "indexing_queries.sql";

    public static final String EXPORT_QUERIES_RESOURCE = "export_queries.sql";


    public static final String AWS_PROFILE_NAME = "sso_pn-confinfo-prod";
    public static final String AWS_REGION_CODE = "eu-south-1";
    public static final String BUCKET_NAME = "dynamodb-export-350578575906-eu-south-1";
    public static final String EC_METADATA_EXPORT_FOLDER = "pn-EcRichiesteMetadati/exports/20231116/";

    public static final String EC_METADATA_EXPORT_DATA_FILE = "^.*/data/[^/]*.json.gz$";

    public static final Path INDEXED_OUTPUT_FOLDER_PATH = Paths.get( "./out/indexed" );

    //public static final String EXTRACTION_OUTPUT_FOLDER = ;
    public static final Path EXTRACTION_OUTPUT_FOLDER_PATH = Paths.get( "./out/extraction" );

    private static final int CHUNK_SIZE = 100 * 1000;

    private static final int MIN_ROWS = 70 * 1000;
    private static final int MAX_ROWS = 120 * 1000;

    @Test
    public void downloadFromExport() throws IOException {

        MsgListenerImpl logger = new MsgListenerImpl();

        SqlQueryMap queries = SqlQueryMap.fromClasspathResource( INDEXING_QUERIES_RESOURCE );

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore( "Ec Metadata Indexing");
        spark.addListener( logger );

        S3FileLister s3 = new S3FileLister( AWS_PROFILE_NAME, AWS_REGION_CODE );
        s3.addListener( logger );

        EcMetadataIndexingJobFactory jobFactory = EcMetadataIndexingJobFactory
                                         .newInstance( spark, queries, INDEXED_OUTPUT_FOLDER_PATH );

        cleanFolder( INDEXED_OUTPUT_FOLDER_PATH );



        Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                BUCKET_NAME,
                EC_METADATA_EXPORT_FOLDER,
                EC_METADATA_EXPORT_DATA_FILE
        );

        Stream<List<String>> chunkedJsonStream = chunkedStream(
                oneJsonObjectPerLine( s3ContentsStream),
                CHUNK_SIZE
        );



        AtomicInteger chunkNumber = new AtomicInteger(0);

        chunkedJsonStream.forEach( dataChunk -> {

            int chunkId = chunkNumber.getAndAdd( 1 );
            String jobName = "chunk " + chunkId;

            spark.addJob( jobName, jobFactory.newJob( chunkId, dataChunk ));
        });

        spark.shutdown(1, TimeUnit.HOURS );
    }






    @Test
    public void dataToCsv() throws IOException {

        SqlQueryMap queries = SqlQueryMap.fromClasspathResource( EXPORT_QUERIES_RESOURCE );
        ExtractorDayAggregator extractionPolicy = new ExtractorDayAggregator( MIN_ROWS, MAX_ROWS );

        MsgListenerImpl logger = new MsgListenerImpl();
        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore("Export EcMetadata");
        spark.addListener( logger );

        cleanFolder( EXTRACTION_OUTPUT_FOLDER_PATH );

        spark.readParquetTable( INDEXED_OUTPUT_FOLDER_PATH, "ec_metadta__fromfile" );

        for( String queryName: queries.getQueriesNames() ) {
            String sqlQuery = queries.getQuery(queryName);
            System.out.println( "############## EXECUTE QUERY " + queryName);
            System.out.println( sqlQuery );

            spark.execSql(sqlQuery);
        }

        spark.tableToCsvSingleFile(
                "cardinality_by_product_and_sequence",
                EXTRACTION_OUTPUT_FOLDER_PATH.resolve("summary.csv")
            );



        Map<String, List<ExtractorDayAggregator.CardinalityByProductAndDayRow>> daySummaries = spark
                .tableToBeanStream(
                        "cardinality_by_product_and_day",
                        ExtractorDayAggregator.CardinalityByProductAndDayRow.class
                )
                .collect(Collectors.groupingBy(
                        ExtractorDayAggregator.CardinalityByProductAndDayRow::getPapeprMeta_productType
                ));


        Map<String, List<ExtractorDayAggregator.ExtractionInterval>> extractionsByProduct;
        extractionsByProduct = extractionPolicy.computeExtractionsListFromSummary(daySummaries);


        ExtractorJobFactory jobFactory = ExtractorJobFactory.newInstance( spark, EXTRACTION_OUTPUT_FOLDER_PATH );

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
    }

}
