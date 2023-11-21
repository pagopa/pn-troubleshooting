package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;

import java.nio.file.Path;

public class ExtractorJobFactory {

    public static ExtractorJobFactory newInstance( SparkSqlWrapper spark, Path outputFolder ) {
        return new ExtractorJobFactory( spark, outputFolder );
    }

    private final SparkSqlWrapper spark;
    private final Path outputFolder;

    private ExtractorJobFactory( SparkSqlWrapper spark, Path outputFolder ) {
        this.spark = spark;
        this.outputFolder = outputFolder;
    }

    public Runnable extractionJob( String productType, String dayFrom, String dayTo ) {
        return () -> {
                String tableName = "export_" + productType + "__" + dayFrom + "__" + dayTo;
                tableName = tableName.replace('-', '_');
                String fileName = tableName + ".csv";

                String sql = extactionQuery( tableName, productType, dayFrom, dayTo );
                spark.execSql( sql );
                spark.tableToCsvSingleFile( tableName, outputFolder.resolve( fileName ));
                spark.removeTable( tableName );
            };
    }

    private String extactionQuery( String tableName, String product, String fromDay, String toDay) {
        return String.format("create or replace temporary view %s as" +
                        "  SELECT \n" +
                        "    *" +
                        "  FROM\n" +
                        "    all_paper_metadata_with_synthetic_select_list\n" +
                        "  WHERE\n" +
                        "      paperMeta_productType = '%s' \n" +
                        "    AND \n" +
                        "      requestTimestamp BETWEEN '%sT00:00:00' and '%sT24:00:00' " +
                        "  ORDER BY \n" +
                        "    requestTimestamp, " +
                        "    requestId",
                tableName, product, fromDay, toDay
            );
    }
}
