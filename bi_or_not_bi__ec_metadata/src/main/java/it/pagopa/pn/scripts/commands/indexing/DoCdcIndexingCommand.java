package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.datafixes.JsonTrasfromationHolder;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.aws.s3client.S3ClientWrapper;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import org.apache.commons.lang3.StringUtils;
import org.jetbrains.annotations.NotNull;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.ParentCommand;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.commands.utils.StreamUtils.chunkedStream;
import static it.pagopa.pn.scripts.commands.utils.StreamUtils.oneJsonObjectPerLine;

@Command(name = "cdcIndexing")
public class DoCdcIndexingCommand extends AbstractUploadSupport implements Callable<Integer> {
    public static final String INDEXING_QUERIES_RESOURCE = "cdc_indexing_queries.sql";
    @ParentCommand
    CommandsMain parent;

    @Option(names = {"--result-upload-url"})
    private String baseUploadUrl = null;
    @Override
    protected String getBaseUploadUrl() {
        return baseUploadUrl;
    }

    private JsonTrasfromationHolder getJsonTransformations() {
        return this.parent.getJsonTransformations();
    }

    @Option(names = {"--aws-profile"}, arity = "1")
    private String awsProfileName = null;

    @Option(names = {"--not-after-today"} )
    private boolean notAfterToday = true;


    @Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @Option(names = {"--aws-bucket"}, arity = "1")
    private String bucketName = null;

    @Option(names = {"--aws-folder-prefix"})
    private String cdcFolderPrefix = "cdcTos3/TABLE_NAME_";

    private Path getCdcIndexedOutputFolder() {
        return parent.getCdcIndexedOutputFolder();
    }

    @Override
    protected Path getBaseOutputFolder() {
        return getCdcIndexedOutputFolder();
    }


    @Option(names = {"--data-chunk-size"})
    private int chunkSize = 500 * 1000;

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

        SparkSqlWrapper spark = SparkSqlWrapper.local("CDC Indexing", null, true);
        spark.addListener(logger);

        S3ClientWrapper s3 = new S3ClientWrapper(awsProfileName, awsRegionCode);
        //s3.addListener(logger);

        Path indexedOutputFolderPath = parent.getCdcIndexedOutputFolder();
        CdcIndexingJobFactory jobFactory = CdcIndexingJobFactory.newInstance( spark, queries, indexedOutputFolderPath );


        Stream<DateHoursStream.DateHour> dates = DateHoursStream.stream(
                DateHoursStream.DateHour.valueOf( fromDate, "-" ),
                DateHoursStream.DateHour.valueOf( toDate, "-" ),
                DateHoursStream.TimeUnitStep.DAY,
                notAfterToday
            );

        dates.forEachOrdered( (d) -> {
            System.out.println(" ################ cdc indexing " + tableName + " " + d.toString("-"));

            if( isMissingFromUploadDestination( jobFactory, d, s3) ) {

                String prefix = cdcFolderPrefix + tableName + "/" + d.toString("/");

                Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                        bucketName, prefix, ".*pn-cdcTos3.*" );
                Stream<List<String>> chunkedJsonStream = chunkedStream(
                        oneJsonObjectPerLine(s3ContentsStream),
                        chunkSize
                );

                AtomicInteger chunkNumber = new AtomicInteger(0);

                chunkedJsonStream.forEach(dataChunk -> {

                    String chunkId = "" + chunkNumber.getAndIncrement();

                    System.out.println( "## " + d.toString("-") + "_" + chunkId + " SIZE: " + dataChunk.size());

                    if (dataChunk.size() > 0) {
                        dataChunk = getJsonTransformations().applyTransformation( dataChunk );
                        JobWithOutput job = jobFactory.newJob(tableName, d, dataChunk, chunkId);

                        String jobName = tableName + "_" + d.toString("") + "_" + chunkId;
                        job = wrapWithUpload( job, s3 );
                        spark.addJob(jobName, job);
                    }
                });
            }


        });

        spark.shutdown( 5, TimeUnit.HOURS );

        return 0;
    }

    private boolean isMissingFromUploadDestination(CdcIndexingJobFactory jobFactory, DateHoursStream.DateHour d, S3ClientWrapper s3) {
        Path outputPath = forecastOutputFolder( jobFactory, d );

        return super.isMissingFromUploadDestination( outputPath, s3 );
    }


    private Path forecastOutputFolder(CdcIndexingJobFactory jobFactory, DateHoursStream.DateHour d) {
        return jobFactory.newJob(tableName, d, Collections.emptyList(), "0").outputFolder();
    }

}
