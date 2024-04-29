package it.pagopa.pn.scripts.commands.reports;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import picocli.CommandLine.Command;
import picocli.CommandLine.ParentCommand;

import java.util.concurrent.Callable;

@Command(name = "shipperReliabilityReport")
public class ShipperReliabilityReportCommand implements Callable<Integer> {

    public static final String APPLICATION_NAME = "shipperReliabilityReport";
    public static final String SHIPPER_RELIABILITY_QUERIES_RESOURCE = "ShipperReliabilityReport.sql";

    @ParentCommand
    CommandsMain parent;

    @Override
    public Integer call() {

        MsgListenerImpl logger = new MsgListenerImpl();
        SqlQueryMap queries = SqlQueryMap.fromClasspathResource(SHIPPER_RELIABILITY_QUERIES_RESOURCE);

        SparkSqlWrapper spark = SparkSqlWrapper.localMultiCore(APPLICATION_NAME);
        spark.addListener(logger);

        queries.getQueriesNames().forEach(q -> {
            System.out.println("Executing query: " + q);

            Dataset<Row> report = spark.execSql(queries.getQuery(q).getSqlQuery());
            report.printSchema();
        });

        return 0;
    }
}
