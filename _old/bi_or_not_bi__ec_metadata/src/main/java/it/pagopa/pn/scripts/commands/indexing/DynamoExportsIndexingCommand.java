package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.aws.s3client.S3ClientWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream.DateHour;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream.TimeUnitStep;
import org.apache.commons.lang3.StringUtils;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;
import picocli.CommandLine.Option;


import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.commands.utils.StreamUtils.chunkedStream;
import static it.pagopa.pn.scripts.commands.utils.StreamUtils.oneJsonObjectPerLine;

@Command(name = "dynamoExportsIndexing")
public class DynamoExportsIndexingCommand extends AbstractUploadSupport implements Callable<Integer> {
    public static final String INDEXING_QUERIES_RESOURCE = "dynamo_export_indexing_queries.sql";
    public static final String DYNAMO_EXPORT_DATA_FILE = "^.*/data/[^/]*.json.gz$";

    @ParentCommand
    CommandsMain parent;
    @Option(names = {"--aws-profile"}, arity = "1")
    private String awsProfileName = null;

    @Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @Option(names = {"--data-chunk-size"})
    private int chunkSize = 100 * 1000;

    @Option(names = {"--aws-bucket"}, arity = "1")
    private String bucketName = null;

    @Option(names = {"--result-upload-url"})
    private String baseUploadUrl = null;
    private S3ClientWrapper s3;

    @Override
    protected String getBaseUploadUrl() {
        return baseUploadUrl;
    }


    @Option(names = {"--aws-dynexport-folder-prefix"})
    private String dynamoExportsAwsFolderPrefix = "%s/exports/inc2024/";
    private String getIncrementalDynamoExportFolder( String incrementalName) {
        return dynamoExportsAwsFolderPrefix.formatted( tableName ) + incrementalName + "/";
    }

    @Option(names = {"--aws-full-export-folder-suffix"})
    private String fullDynamoExportFolderSuffix = "start";
    private String getFullDynamoExportFolder() {
        return getIncrementalDynamoExportFolder( fullDynamoExportFolderSuffix );
    }

    @Option(names = {"--aws-full-export-date"})
    private String fullDynamoExportDate = null;
    private String getFullDynamoExportDate() {
        if( fullDynamoExportDate == null ) {
            initializeExportMetadata();
        }
        return fullDynamoExportDate;
    }

    private void initializeExportMetadata() {
        try {
            JSONObject exportMetadata = getExportMetadataJsonObj();
            this.fullDynamoExportDate = exportMetadata.getString("fullExportDate");
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    private JSONObject getExportMetadataJsonObj() throws JSONException {
        String exportFolder = getFullDynamoExportFolder();
        if( ! exportFolder.endsWith("/") ) {
            exportFolder += "/";
        }
        String metadataS3ObjKey =  exportFolder + "_meta.json";

        String jsonMetadataStr = this.s3.getObjectContetAsString( bucketName, metadataS3ObjKey);

        return new JSONObject( jsonMetadataStr );
    }


    @Override
    protected Path getBaseOutputFolder() {
        return parent.getDynamoExportsIndexedOutputFolder();
    }

    @Option(names = {"--not-today-or-after"} )
    private boolean notTodayOrAfter = true;


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

        SparkSqlWrapper spark = SparkSqlWrapper.local( tableName + " Indexing", null, true);
        spark.addListener(logger);

        s3 = new S3ClientWrapper(awsProfileName, awsRegionCode);
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

            indexOneChunkedStream( spark, jobFactory, chunkedJsonStream, "full_export", s3 );
        }

        if( endDateIsAfterFullExportDate() ) {
            DateHour fullDynamoExportDatePlusOne = DateHour.valueOf( getFullDynamoExportDate(), "-")
                                                     .nextStep( TimeUnitStep.DAY );

            DateHour fromDateObj = DateHour.valueOf( fromDate, "-");

            DateHour incrementalFromDate = Arrays.asList( fullDynamoExportDatePlusOne, fromDateObj)
                    .stream().max( Comparator.naturalOrder() ).get();

            Stream<DateHoursStream.DateHour> dates = DateHoursStream.stream(
                    incrementalFromDate,
                    DateHoursStream.DateHour.valueOf( toDate, "-" ),
                    DateHoursStream.TimeUnitStep.DAY,
                    notTodayOrAfter
                );

            dates.forEachOrdered( date -> {
                Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                        bucketName,
                        getIncrementalDynamoExportFolder( date.toString("") ),
                        DYNAMO_EXPORT_DATA_FILE
                    );

                Stream<List<String>> chunkedJsonStream = chunkedStream(
                        newImageOnly( oneJsonObjectPerLine(s3ContentsStream)),
                        chunkSize
                    );

                String dynExpName = "inc_export_" + date.toString("");
                indexOneChunkedStream( spark, jobFactory, chunkedJsonStream, dynExpName, s3);
            });


        }




        spark.shutdown(1, TimeUnit.HOURS);

        return 0;
    }

    private boolean startDateIsBeforeOrEqualFullExportDate() {
        return fromDate.compareTo(getFullDynamoExportDate()) <= 0;
    }

    private boolean endDateIsAfterFullExportDate() {
        return toDate.compareTo( getFullDynamoExportDate()) > 0;
    }

    private Stream<String> newImageOnly(Stream<String> oneJsonObjectPerLine) {
        return oneJsonObjectPerLine.map( line -> {
            try {
                JSONObject obj = new JSONObject( line );

                String writeMs = obj.getJSONObject("Metadata")
                        .getJSONObject("WriteTimestampMicros").getString("N");
                JSONObject keys = obj.getJSONObject("Keys");

                JSONObject result = new JSONObject();
                result.put("Keys", keys );
                if( obj.has( "NewImage" )) {
                    result.put("Item", obj.getJSONObject("NewImage"));
                }
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
            String dynamoExportName,
            S3ClientWrapper s3
    ) {
        AtomicInteger chunkNumber = new AtomicInteger(0);

        if( isMissingFromUploadDestination( jobFactory, dynamoExportName, s3) ) {

            chunkedJsonStream.forEach(dataChunk -> {

                int chunkId = chunkNumber.getAndAdd(1 );

                String jobName = tableName + " " + dynamoExportName + " chunk " + chunkId;

                JobWithOutput job = jobFactory.newJob(dynamoExportName, chunkId, dataChunk);
                spark.addJob(jobName, wrapWithUpload( job, s3 ));
            });
        }
    }

    private Path forecastOutputFolder( DynamoExportsIndexingJobFactory jobFactory, String dynamoExportName) {
        return jobFactory.newJob( dynamoExportName, 0, Collections.emptyList()).outputFolder();
    }

    private boolean isMissingFromUploadDestination(DynamoExportsIndexingJobFactory jobFactory, String dynamoExportName, S3ClientWrapper s3) {
        Path outputPath = forecastOutputFolder( jobFactory, dynamoExportName );

        return super.isMissingFromUploadDestination( outputPath, s3 );
    }

}
