package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryMap;
import org.apache.spark.sql.SaveMode;
import org.apache.spark.sql.functions;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import static it.pagopa.pn.scripts.commands.utils.PathsUtils.cleanFolder;

public class DynamoExportsIndexingJobFactory {

    public static DynamoExportsIndexingJobFactory newInstance (
            SparkSqlWrapper spark,
            SqlQueryMap queries,
            Path outputFolder,
            String tableName
    ) {
        String outputFolderForTable = outputFolder.resolve( tableName ).toString();
        return new DynamoExportsIndexingJobFactory( spark, queries, tableName, outputFolderForTable );
    }

    private final SparkSqlWrapper spark;
    private final SqlQueryMap queries;

    private final String tableName;

    private final String outputFolder;



    private DynamoExportsIndexingJobFactory(SparkSqlWrapper spark, SqlQueryMap queries, String tableName, String outputFolder ) {
        this.spark = spark;
        this.queries = queries;
        this.tableName = tableName;
        this.outputFolder = outputFolder;
    }

    public Runnable newJob( String dynamoExportName, int chunkId, List<String> dataChunk ) {
        return new DynamoExportsIndexingJob( outputFolder, chunkId, dataChunk, queries, spark, tableName, dynamoExportName );
    }

    private static class DynamoExportsIndexingJob implements Runnable {

        private final String outputFolder;
        private final int chunkId;
        private final List<String> dataChunk;

        private final String tableName;

        private final SqlQueryMap queries;

        private final SparkSqlWrapper spark;

        private final String dynamoExportName;

        DynamoExportsIndexingJob(String outputFolder, int chunkId, List<String> dataChunk, SqlQueryMap queries, SparkSqlWrapper spark, String tableName, String dynamoExportName) {
            this.outputFolder = outputFolder;
            this.chunkId = chunkId;
            this.dataChunk = dataChunk;
            this.queries = queries;
            this.spark = spark;
            this.tableName = tableName;
            this.dynamoExportName = dynamoExportName;
        }


        @Override
        public void run() {

            String chunkSuffix = "_" + tableName.replace('-', '_') + "__" + chunkId;
            String jsonStringsTableName = "json_objects_" + chunkSuffix;
            String parsedDataTableName = "parsed_data" + chunkSuffix;

            spark.ceateTableFromStringCollection( jsonStringsTableName, dataChunk );

            String jsonParsingSql = queries.getQuery( tableName );
            jsonParsingSql = jsonParsingSql.replaceFirst(
                    "json_objects",
                    jsonStringsTableName
            );

            jsonParsingSql = "create or replace temporary view " + parsedDataTableName + " as \n "
                    + jsonParsingSql;

            spark.execSql( jsonParsingSql );

            if( chunkId == 0 ) {
                try {
                    cleanFolder( Paths.get( outputFolder ).resolve("dynamoExportName=" + dynamoExportName ) );
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            }

            spark.execSql( " select * from " + parsedDataTableName )
                    .withColumn("dynamoExportName", functions.lit( dynamoExportName ))
                    .repartition( 1 )
                    .write()
                    .partitionBy("dynamoExportName")
                    .mode(SaveMode.Append).parquet( outputFolder );

            spark.removeTable( parsedDataTableName );
            spark.removeTable( jsonStringsTableName );
        }
    }
}
