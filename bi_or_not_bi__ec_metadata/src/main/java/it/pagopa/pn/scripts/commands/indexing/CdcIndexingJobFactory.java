package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import it.pagopa.pn.scripts.commands.utils.PathsUtils;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import org.apache.spark.sql.SaveMode;
import org.apache.spark.sql.functions;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class CdcIndexingJobFactory {

    public static CdcIndexingJobFactory newInstance (
            SparkSqlWrapper spark,
            SqlQueryMap queries,
            Path outputFolder
    ) {
        return new CdcIndexingJobFactory( spark, queries, outputFolder.toString() );
    }

    private final SparkSqlWrapper spark;
    private final SqlQueryMap queries;

    private final String outputFolder;


    private CdcIndexingJobFactory(SparkSqlWrapper spark, SqlQueryMap queries, String outputFolder) {
        this.spark = spark;
        this.queries = queries;
        this.outputFolder = outputFolder;
    }

    public JobWithOutput newJob(String table, DateHoursStream.DateHour date, List<String> dataChunk, String chunkId ) {
        String tableOutputFolder = outputFolder + File.separator + table;
        String query = queries.getQuery(table).getSqlQuery();

        return new CdcIndexingJob( tableOutputFolder, table, date, dataChunk, chunkId, query, spark );
    }

    private static class CdcIndexingJob implements JobWithOutput {

        private final String outputFolder;
        private final String table;

        private final DateHoursStream.DateHour date;
        private final List<String> dataChunk;

        private final String chunkId;

        private final String query;

        private final Path partitionFolder;

        private final SparkSqlWrapper spark;

        public CdcIndexingJob(String outputFolder, String table, DateHoursStream.DateHour date, List<String> dataChunk, String chunkId, String query, SparkSqlWrapper spark) {
            this.outputFolder = outputFolder;
            this.table = table;
            this.date = date;
            this.dataChunk = dataChunk;
            this.chunkId = chunkId;
            this.query = query;
            this.spark = spark;

            this.partitionFolder = Paths.get(outputFolder + File.separator +
                    String.format(
                            "cdcYear=%d%scdcMonth=%d%scdcDay=%d%s" ,
                            date.getYear(),
                            File.separator,
                            date.getMonth(),
                            File.separator,
                            date.getDay(),
                            File.separator
                    ));
        }

        @Override
        public void run() {

            String chunkSuffix = "__" + table.replace('-', '_') + "_" + date.toString("_") + "_" + chunkId;
            String jsonStringsTableName = "json_objects_cdc" + chunkSuffix;
            String parsedDataTableName = "cdc" + chunkSuffix;

            spark.ceateTableFromStringCollection( jsonStringsTableName, dataChunk );

            String jsonParsingSql = query.replaceFirst(
                    "json_objects_cdc",
                    jsonStringsTableName
            );

            jsonParsingSql = "create or replace temporary view " + parsedDataTableName + " as \n "
                    + jsonParsingSql;
            spark.execSql( jsonParsingSql );

            try {
                if( chunkId.equals("0") ) {
                    PathsUtils.cleanFolder( partitionFolder );
                }
            } catch (IOException e) {
                throw new RuntimeException(e);
            }

            spark.execSql( " select * from " + parsedDataTableName )
                    .withColumn("cdcYear", functions.lit( date.getYear() ))
                    .withColumn("cdcMonth", functions.lit( date.getMonth() ))
                    .withColumn("cdcDay", functions.lit( date.getDay() ))
                    .repartition( 1 )
                    .write()
                    .partitionBy("cdcYear","cdcMonth","cdcDay")
                    .mode(SaveMode.Append).parquet( outputFolder );

            spark.removeTable( parsedDataTableName );
            spark.removeTable( jsonStringsTableName );
        }

        @Override
        public Path outputFolder() {
            return partitionFolder;
        }
    }
}
