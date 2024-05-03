package it.pagopa.pn.scripts.commands.reports;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.config.resolver.ObjectMapperResolver;
import it.pagopa.pn.scripts.commands.dag.TaskDag;
import it.pagopa.pn.scripts.commands.dag.TaskRunner;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.SchemaEnum;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.reports.model.Report;
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
import java.util.concurrent.Callable;
import java.util.function.Function;

@Command(name = "shipperReliabilityReport")
public class ShipperReliabilityReportCommand implements Callable<Integer> {

    private static final String APPLICATION_NAME = "shipperReliabilityReport";
    private static final String REPORT_FOLDER = "/parquet";

    private final ObjectMapper mapper = ObjectMapperResolver.getObjectMapper();

    @CommandLine.Option( names = {"--report"}, arity = "1")
    private Path reportPath;

    @CommandLine.Option( names = {"--source-path"}, arity = "1")
    private Path sourceBasePath;

    @CommandLine.Option( names = {"--export-bucket"}, arity = "1")
    private String exportBucket;

    @ParentCommand
    CommandsMain parent;

    @Override
    public Integer call() throws IOException {

        MsgListenerImpl logger = new MsgListenerImpl();
        SparkConf sparkConf = new SparkConf()
            .set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            .set("spark.hadoop.fs.s3a.path.style.access", "true")
            .set("spark.hadoop.fs.s3a.requester.pays.enabled", "true");

        SparkSqlWrapper spark = SparkSqlWrapper.local(APPLICATION_NAME, sparkConf, true);
        spark.addListener(logger);

        // Read report to retrieve information
        Report report = this.mapper.readValue(reportPath.toFile(), Report.class);

        // Read query dependencies
        SqlQueryDag sqlQueryDag = SqlQueryDag.fromFile(
            report.getTask().getScript().getPath(),
            report.getTask().getScript().getEntry(),
            sourceBasePath.toString()
        );

        // Define task for each job and adapt graph
        Function<Task, Object> job = task -> spark.execSql(((SQLTask) task).getSqlQuery());
        TaskDag taskDag = QueryDagToTaskDagAdapter.from(sqlQueryDag, job);

        // Instantiate runner and run
        TaskRunner taskRunner = new TaskRunner(taskDag);
        taskRunner.linearRun();

        // Find leaf node to get last result
        @SuppressWarnings("unchecked")
        Dataset<Row> datasetReport = taskDag.getEntryPoint()
            .getResult(Dataset.class);

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
            .build()
            .write();

        return 0;
    }
}
