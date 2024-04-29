package it.pagopa.pn.scripts.commands.reports;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.reports.model.Report;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Callable;

@Command(name = "shipperReliabilityReport")
public class ShipperReliabilityReportCommand implements Callable<Integer> {

    public static final String APPLICATION_NAME = "shipperReliabilityReport";

    private final ObjectMapper mapper = new ObjectMapper();

    @CommandLine.Option( names = {"--report"}, arity = "1")
    private Path reportPath;

    @CommandLine.Option( names = {"--sql-sources"}, arity = "1")
    private Path sourceBasePath;

    @ParentCommand
    CommandsMain parent;

    @Override
    public Integer call() throws IOException {

        MsgListenerImpl logger = new MsgListenerImpl();

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore(APPLICATION_NAME);
        spark.addListener(logger);

        // Read report to retrieve information
        Report report = this.mapper.readValue(reportPath.toFile(), Report.class);

        // Read query dependencies
        SqlQueryDag sqlQueryDag = new SqlQueryDag(
            report.getTask().getScript().getPath(),
            report.getTask().getScript().getEntry(),
            sourceBasePath.toString(),
            false
        );

        return 0;
    }
}
