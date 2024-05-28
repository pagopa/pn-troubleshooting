package it.pagopa.pn.scripts.commands.reports;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.config.resolver.ObjectMapperResolver;
import it.pagopa.pn.scripts.commands.dag.SparkTaskRunner;
import it.pagopa.pn.scripts.commands.dag.TaskDag;
import it.pagopa.pn.scripts.commands.dag.TaskRunner;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.SchemaEnum;
import it.pagopa.pn.scripts.commands.logs.LoggerFactory;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.reports.model.Report;
import it.pagopa.pn.scripts.commands.reports.model.ReportFleet;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;
import it.pagopa.pn.scripts.commands.utils.PathsUtils;
import it.pagopa.pn.scripts.commands.utils.QueryDagToTaskDagAdapter;
import it.pagopa.pn.scripts.commands.utils.SparkDatasetWriter;
import org.apache.spark.SparkConf;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.concurrent.Callable;
import java.util.function.Function;
import java.util.logging.Level;
import java.util.logging.Logger;

@Command(name = "taskDagExecutor")
public class TaskDagExecutorCommand implements Callable<Integer> {

    private static final Logger log = LoggerFactory.getLogger();

    private static final String APPLICATION_NAME = "taskDagExecutor";
    private static final String REPORT_FOLDER = "/reports";

    private final ObjectMapper mapper = ObjectMapperResolver.getObjectMapper();

    @CommandLine.Option( names = {"--report-fleet"}, arity = "1")
    private Path reportFleetPath;

    @CommandLine.Option( names = {"--source-path"}, arity = "1")
    private Path sourceBasePath;

    @CommandLine.Option( names = {"--export-bucket"}, arity = "1")
    private String exportBucket;

    @ParentCommand
    CommandsMain parent;

    @Override
    public Integer call() throws IOException {

        log.info("Starting command " + APPLICATION_NAME);
        Instant start = Instant.now();

        // Initialize spark session and get wrapper
        SparkSqlWrapper spark = this.sparkInit();

        // Read reports to retrieve information
        ReportFleet reports = this.mapper.readValue(reportFleetPath.toFile(), ReportFleet.class);

        // Define task for each job and adapt graph
        Function<Task, Object> job = task -> spark.execSql(((SQLTask) task).getSqlQuery());

        // Build unique task DAG
        TaskDag taskDag = QueryDagToTaskDagAdapter.from(parseQueryDag(reports), job);

        // Instantiate runner and run single threaded
        TaskRunner taskRunner = new SparkTaskRunner(taskDag, spark);
        taskRunner.linearRun();

        // Produce report for each case
        reports.getReports()
            .forEach(report -> this.writeOutReport(report, taskDag));

        long completionTime = Instant.now().toEpochMilli() - start.toEpochMilli();
        log.log(Level.INFO, () -> APPLICATION_NAME + " completed in " + completionTime + "ms");

        return 0;
    }

    /**
     * Initialize Spark context providing a common {@link SparkConf} to work with S3A protocol and enable ECS
     * credential discovery.
     *
     * @return {@link SparkSqlWrapper} object that wrap Spark Context
     * */
    private SparkSqlWrapper sparkInit() {
        MsgListenerImpl logger = new MsgListenerImpl();
        SparkConf sparkConf = new SparkConf()
            .set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            .set("spark.hadoop.fs.s3a.path.style.access", "true")
            .set("spark.hadoop.fs.s3a.aws.credentials.provider", "com.amazonaws.auth.ContainerCredentialsProvider");

        SparkSqlWrapper spark = SparkSqlWrapper.local(APPLICATION_NAME, sparkConf, true);
        spark.addListener(logger);

        return spark;
    }

    /**
     * Collect all DAG retrieved from each report and parsed accordingly to {@link SqlQueryDag#fromFile} method
     *
     * @param reports all reports to generate through DAG definition
     *
     * @return a collection of {@link SqlQueryDag} object
     * */
    private Collection<SqlQueryDag> parseQueryDag(ReportFleet reports) {
        Collection<SqlQueryDag> sqlQueryDags = new HashSet<>();

        reports.getReports().forEach(report -> {

            // Read query dependencies
            SqlQueryDag sqlQueryDag = SqlQueryDag.fromFile(
                report.getTask().getScript().getPath(),
                report.getTask().getScript().getEntry(),
                sourceBasePath.toString()
            );

            sqlQueryDags.add(sqlQueryDag);
        });

        return sqlQueryDags;
    }

    /**
     * Write out the report using information stored within {@link Report} class in order to find the leaf node
     * that holds generator query
     *
     * @param report    report to write out
     * @param taskDag   DAG from which retrieve leaf node
     *
     * */
    private void writeOutReport(Report report, TaskDag taskDag) {
        String leafId = Task.buildId(
            report.getTask().getScript().getPath(),
            report.getTask().getScript().getEntry()
        );

        // Find leaf node to get last result
        Task entryPointTask = taskDag.getEntryPointById(leafId);
        if (entryPointTask == null) {
            log.severe(() -> "EntryPoint " + leafId + " not found; skipping report writing");
            return;
        }

        @SuppressWarnings("unchecked")
        Dataset<Row> datasetReport = entryPointTask.getResult(Dataset.class);

        // Compute S3a path
        String s3Out = PathsUtils.concatPathsWithURISchema(
            SchemaEnum.S3A.getSchema(),
            this.exportBucket,
            REPORT_FOLDER,
            PathsUtils.datePathFromNow(),
            PathsUtils.filenameWithExtensions(report.getName(), report.getOutputFormat().getExtension())
        );

        // Write out report
        SparkDatasetWriter.builder()
            .dataset(datasetReport)
            .outLocation(s3Out)
            .format(report.getOutputFormat())
            .saveMode(SaveMode.Overwrite)
            .partitions(report.getPartitions())
            .partitionKeys(report.getPartitionKeys())
            .build()
            .write();
    }
}
