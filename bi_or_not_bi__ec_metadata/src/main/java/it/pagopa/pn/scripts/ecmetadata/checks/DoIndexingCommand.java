package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.ecmetadata.checks.s3client.S3FileLister;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SqlQueryMap;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;


import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static it.pagopa.pn.scripts.ecmetadata.checks.utils.PathsUtils.cleanFolder;
import static it.pagopa.pn.scripts.ecmetadata.checks.utils.StreamUtils.chunkedStream;
import static it.pagopa.pn.scripts.ecmetadata.checks.utils.StreamUtils.oneJsonObjectPerLine;

@Command(name = "index")
class DoIndexingCommand implements Callable<Integer> {
    public static final String INDEXING_QUERIES_RESOURCE = "indexing_queries.sql";
    public static final String EC_METADATA_EXPORT_DATA_FILE = "^.*/data/[^/]*.json.gz$";

    @ParentCommand
    EcMetadataAnalisysMain parent;
    @Option(names = {"--aws-profile"})
    private String awsProfileName = "sso_pn-confinfo-prod";

    @Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @Option(names = {"--aws-bucket"})
    private String bucketName = "dynamodb-export-350578575906-eu-south-1";

    @Option(names = {"--aws-folder-prefix"})
    private String ecMetadataFolderPrefix = "pn-EcRichiesteMetadati/exports/";

    @Parameters(index = "0", description = "Usually an ISO date in the form YYYYMMDD")
    private String exportFolderName;

    private String getEcMetadataExportFolder() {
        return ecMetadataFolderPrefix + exportFolderName + "/";
    }

    @Option(names = {"--data-chunk-size"})
    private int chunkSize = 100 * 1000;

    @Override
    public Integer call() throws Exception {

        MsgListenerImpl logger = new MsgListenerImpl();

        SqlQueryMap queries = SqlQueryMap.fromClasspathResource(INDEXING_QUERIES_RESOURCE);

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore("Ec Metadata Indexing");
        spark.addListener(logger);

        S3FileLister s3 = new S3FileLister(awsProfileName, awsRegionCode);
        s3.addListener(logger);

        Path indexedOutputFolderPath = parent.getIndexedOutputFolder();
        EcMetadataIndexingJobFactory jobFactory = EcMetadataIndexingJobFactory
                .newInstance(spark, queries, indexedOutputFolderPath);

        cleanFolder(indexedOutputFolderPath);


        Stream<String> s3ContentsStream = s3.listObjectsWithPrefixAndRegExpContent(
                bucketName,
                getEcMetadataExportFolder(),
                EC_METADATA_EXPORT_DATA_FILE
        );

        Stream<List<String>> chunkedJsonStream = chunkedStream(
                oneJsonObjectPerLine(s3ContentsStream),
                chunkSize
        );


        AtomicInteger chunkNumber = new AtomicInteger(0);

        chunkedJsonStream.forEach(dataChunk -> {

            int chunkId = chunkNumber.getAndAdd(1);
            String jobName = "chunk " + chunkId;

            spark.addJob(jobName, jobFactory.newJob(chunkId, dataChunk));
        });

        spark.shutdown(1, TimeUnit.HOURS);

        return 0;
    }
}
