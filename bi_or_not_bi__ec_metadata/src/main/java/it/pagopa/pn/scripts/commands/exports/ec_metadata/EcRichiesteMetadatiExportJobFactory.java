package it.pagopa.pn.scripts.commands.exports.ec_metadata;

import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class EcRichiesteMetadatiExportJobFactory {

    public static EcRichiesteMetadatiExportJobFactory newInstance(
            SparkSqlWrapper spark, Path outputFolder, String barCharDataCsvFileName ) {
        return new EcRichiesteMetadatiExportJobFactory( spark, outputFolder, barCharDataCsvFileName);
    }

    private final SparkSqlWrapper spark;
    private final Path outputFolder;

    private final String barCharDataCsvFileName;

    private EcRichiesteMetadatiExportJobFactory(SparkSqlWrapper spark, Path outputFolder, String barCharDataCsvFileName) {
        this.spark = spark;
        this.outputFolder = outputFolder;
        this.barCharDataCsvFileName = barCharDataCsvFileName;
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

    public Runnable newBarChartDataExtractionJob() {
        Path barChartDataPath = outputFolder.resolve( barCharDataCsvFileName );
        return new BarChartExtraction( spark, barChartDataPath );
    }


    private static class BarChartExtraction implements Runnable {

        public static final List<String> ORDERED_STAGES = Arrays.asList("INFLIGHT", "refused", "accepted", "printing", "UNKNOWN", "done");
        private final SparkSqlWrapper spark;

        private final Path barcharDataPath;

        private BarChartExtraction(SparkSqlWrapper spark, Path barcharDataPath) {
            this.spark = spark;
            this.barcharDataPath = barcharDataPath;
        }

        @Override
        public void run() {
            List<String> allStages = spark.execSql("select distinct stage from all_paper_metadata_with_synthetic_select_list")
                    .collectAsList().stream()
                    .map( r -> r.getString( 0 ))
                    .collect(Collectors.toList());

            List<String> notListedStages = new ArrayList<>( allStages );
            notListedStages.removeAll( ORDERED_STAGES );

            List<String> stages = new ArrayList<>( ORDERED_STAGES );
            stages.addAll( notListedStages );

            spark.execSql( barChartDataQuery( stages ));
            spark.tableToCsvSingleFile("bar_chart_data", barcharDataPath );
        }


        private String barChartDataQuery( List<String> stages ) {
            String stagesCounters = stages.stream()
                    .map( s -> "coalesce(get_json_object(json_data, '$." + s + "'),0) as " + s )
                    .collect(Collectors.joining(", "));

            return String.format("create or replace temporary view bar_chart_data as" +
                    "  WITH \n" +
                    "    day_stage AS (\n" +
                    "      SELECT\n" +
                    "        paperMeta_productType,\n" +
                    "        date(requestTimestamp) as day,\n" +
                    "        concat( '\\\"', stage, '\\\":', count( requestId) ) as stage_card,\n" +
                    "        count( requestId) as cardinality\n" +
                    "      FROM\n" +
                    "        all_paper_metadata_with_synthetic_select_list\n" +
                    "      GROUP BY\n" +
                    "        paperMeta_productType,\n" +
                    "        date(requestTimestamp),\n" +
                    "        stage\n" +
                    "    ),\n" +
                    "    day_json AS (\n" +
                    "      SELECT\n" +
                    "        paperMeta_productType,\n" +
                    "        day,\n" +
                    "        concat( '{', array_join(collect_list( stage_card), ', '), '}') \n" +
                    "          as json_data,\n" +
                    "        sum( cardinality ) as total\n" +
                    "      FROM\n" +
                    "        day_stage\n" +
                    "      GROUP BY \n" +
                    "        paperMeta_productType,\n" +
                    "        day\n" +
                    "      ORDER BY\n" +
                    "        paperMeta_productType,\n" +
                    "        day  \n" +
                    "    )\n" +
                    "    SELECT\n" +
                    "      paperMeta_productType as product,\n" +
                    "      day,\n" +
                    "      %s, " +
                    "      total\n" +
                    "    FROM\n" +
                    "      day_json\n" +
                    "    ORDER BY\n" +
                    "      paperMeta_productType,\n" +
                    "      day\n" +
                    "", stagesCounters);
        }
    }
}
