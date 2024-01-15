package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.datafixes.JsonTrasfromationHolder;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.aws.s3client.S3FileLister;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.ParentCommand;

import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.commands.utils.StreamUtils.chunkedStream;
import static it.pagopa.pn.scripts.commands.utils.StreamUtils.oneJsonObjectPerLine;

@Command(name = "cdcIndexing")
public class DoCdcIndexingCommand implements Callable<Integer> {
    public static final String INDEXING_QUERIES_RESOURCE = "cdc_indexing_queries.sql";
    @ParentCommand
    CommandsMain parent;
    private JsonTrasfromationHolder getJsonTransformations() {
        return this.parent.getJsonTransformations();
    }

    @Option(names = {"--aws-profile"}, arity = "1")
    private String awsProfileName = null;

    @Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @Option(names = {"--aws-bucket"}, arity = "1")
    private String bucketName = null;

    @Option(names = {"--aws-folder-prefix"})
    private String cdcFolderPrefix = "cdcTos3/TABLE_NAME_";

    private Path getCdcIndexedOutputFolder() {
        return parent.getCdcIndexedOutputFolder();
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

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore("CDC Indexing");
        spark.addListener(logger);

        S3FileLister s3 = new S3FileLister(awsProfileName, awsRegionCode);
        //s3.addListener(logger);

        Path indexedOutputFolderPath = parent.getCdcIndexedOutputFolder();
        CdcIndexingJobFactory jobFactory = CdcIndexingJobFactory.newInstance( spark, queries, indexedOutputFolderPath );


        Stream<DateHoursStream.DateHour> dates = DateHoursStream.stream(
                DateHoursStream.DateHour.valueOf( fromDate, "-" ),
                DateHoursStream.DateHour.valueOf( toDate, "-" ),
                DateHoursStream.TimeUnitStep.DAY
            );

        dates.forEachOrdered( (d) -> {
            System.out.println(" ################ cdc indexing " + tableName + " " + d.toString("-"));
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
                    Runnable job = jobFactory.newJob(tableName, d, dataChunk, chunkId);

                    String jobName = tableName + "_" + d.toString("") + "_" + chunkId;
                    spark.addJob(jobName, job);
                }
            });
        });

        spark.shutdown( 5, TimeUnit.HOURS );

        return 0;
    }

}
