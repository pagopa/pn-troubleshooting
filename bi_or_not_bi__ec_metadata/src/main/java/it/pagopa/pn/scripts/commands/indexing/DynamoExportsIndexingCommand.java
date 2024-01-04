package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.s3client.S3FileLister;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream.DateHour;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream.TimeUnitStep;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;
import picocli.CommandLine.Option;


import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.commands.utils.StreamUtils.chunkedStream;
import static it.pagopa.pn.scripts.commands.utils.StreamUtils.oneJsonObjectPerLine;

@Command(name = "dynamoExportsIndexing")
public class DynamoExportsIndexingCommand implements Callable<Integer> {
    public static final String INDEXING_QUERIES_RESOURCE = "dynamo_export_indexing_queries.sql";
    public static final String DYNAMO_EXPORT_DATA_FILE = "^.*/data/[^/]*.json.gz$";

    @ParentCommand
    CommandsMain parent;
    @Option(names = {"--aws-profile"})
    private String awsProfileName = "sso_pn-confinfo-prod";

    @Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @Option(names = {"--data-chunk-size"})
    private int chunkSize = 100 * 1000;

    @Option(names = {"--aws-bucket"})
    private String bucketName = "dynamodb-export-350578575906-eu-south-1";

    @Option(names = {"--aws-folder-prefix"})
    private String dynamoExportsAwsFolderPrefix = "pn-EcRichiesteMetadati/exports/inc2024/";

    @Option(names = {"--aws-full-export-folder-suffix"})
    private String fullDynamoExportFolderSuffix = "start";
    private String getFullDynamoExportFolder() {
        return dynamoExportsAwsFolderPrefix + fullDynamoExportFolderSuffix + "/";
    }

    @Option(names = {"--aws-full-export-date"})
    private String fullDynamoExportDate = "2023-12-31";


    @CommandLine.Parameters(index = "0", description = "Table Name")
    private String tableName;

    @CommandLine.Parameters(index = "1", description = "Indexing starting date inclusive; ISO date in the form YYYY-MM-DD")
    private String fromDate;

    @CommandLine.Parameters(index = "2", description = "Indexing starting date exclusive; ISO date in the form YYYY-MM-DD")
    private String toDate;


    @Override
    public Integer call() throws Exception {

        MsgListenerImpl logger = new MsgListenerImpl();

        SqlQueryMap queries = SqlQueryMap.fromClasspathResource(INDEXING_QUERIES_RESOURCE);

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore( tableName + " Indexing");
        spark.addListener(logger);

        S3FileLister s3 = new S3FileLister(awsProfileName, awsRegionCode);
        s3.addListener(logger);

        Path indexedOutputFolderPath = parent.getDynamoExportsIndexedOutputFolder();
        DynamoExportsIndexingJobFactory jobFactory = DynamoExportsIndexingJobFactory
                .newInstance(spark, queries, indexedOutputFolderPath, tableName);

        if ( startDateIsBeforeOrEqualFullExportDate() ) {

            Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                    bucketName,
                    getFullDynamoExportFolder(),
                    DYNAMO_EXPORT_DATA_FILE
            );

            Stream<List<String>> chunkedJsonStream = chunkedStream(
                    oneJsonObjectPerLine(s3ContentsStream),
                    chunkSize
            );

            indexOneChunkedStream( spark, jobFactory, chunkedJsonStream, "full_export" );
        }

        if( endDateIsAfterFullExportDate() ) {
            DateHour fullDynamoExportDatePlusOne = DateHour.valueOf( fullDynamoExportDate, "-")
                                                     .nextStep( TimeUnitStep.DAY );

            DateHour fromDateObj = DateHour.valueOf( fromDate, "-");

            DateHour incrementalFromDate = Arrays.asList( fullDynamoExportDatePlusOne, fromDateObj)
                    .stream().max( Comparator.naturalOrder() ).get();

            Stream<DateHoursStream.DateHour> dates = DateHoursStream.stream(
                    incrementalFromDate,
                    DateHoursStream.DateHour.valueOf( toDate, "-" ),
                    DateHoursStream.TimeUnitStep.DAY
                );

            dates.forEachOrdered( date -> {
                Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                        bucketName,
                        dynamoExportsAwsFolderPrefix + date.toString(""),
                        DYNAMO_EXPORT_DATA_FILE
                    );

                Stream<List<String>> chunkedJsonStream = chunkedStream(
                        newImageOnly( oneJsonObjectPerLine(s3ContentsStream)),
                        chunkSize
                    );

                String dynExpName = "inc_export_" + date.toString("");
                indexOneChunkedStream( spark, jobFactory, chunkedJsonStream, dynExpName);
            });


        }




        spark.shutdown(1, TimeUnit.HOURS);

        return 0;
    }

    private boolean startDateIsBeforeOrEqualFullExportDate() {
        return fromDate.compareTo(fullDynamoExportDate) <= 0;
    }

    private boolean endDateIsAfterFullExportDate() {
        return toDate.compareTo( fullDynamoExportDate) > 0;
    }

    private Stream<String> newImageOnly(Stream<String> oneJsonObjectPerLine) {
        return oneJsonObjectPerLine.map( line -> {
            try {
                JSONObject obj = new JSONObject( line );

                String writeMs = obj.getJSONObject("Metadata")
                        .getJSONObject("WriteTimestampMicros").getString("N");

                JSONObject result = new JSONObject();
                result.put("Item", obj.getJSONObject("NewImage"));
                result.put("Metadata_WriteTimestampMicros", Long.parseLong( writeMs ) );
                return result.toString();
            } catch (JSONException e) {
                throw new RuntimeException(e);
            }
        });
    }


    private void indexOneChunkedStream(
            SparkSqlWrapper spark,
            DynamoExportsIndexingJobFactory jobFactory,
            Stream<List<String>> chunkedJsonStream,
            String dynamoExportName
    ) {
        AtomicInteger chunkNumber = new AtomicInteger(0);

        chunkedJsonStream.forEach(dataChunk -> {

            int chunkId = chunkNumber.getAndAdd(1 );

            String jobName = tableName + " " + dynamoExportName + " chunk " + chunkId;

            spark.addJob(jobName, jobFactory.newJob(dynamoExportName, chunkId, dataChunk));
        });
    }
}
