package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.ecmetadata.checks.sparksql.SqlQueryMap;
import org.apache.spark.sql.SaveMode;

import java.nio.file.Path;
import java.util.List;

public class EcMetadataIndexingJobFactory {

    public static EcMetadataIndexingJobFactory newInstance (
            SparkSqlWrapper spark,
            SqlQueryMap queries,
            Path outputFolder
    ) {
        return new EcMetadataIndexingJobFactory( spark, queries, outputFolder.toString() );
    }

    private final SparkSqlWrapper spark;
    private final SqlQueryMap queries;

    private final String outputFolder;


    private EcMetadataIndexingJobFactory(SparkSqlWrapper spark, SqlQueryMap queries, String outputFolder) {
        this.spark = spark;
        this.queries = queries;
        this.outputFolder = outputFolder;
    }

    public Runnable newJob( int chunkId, List<String> dataChunk ) {
        return new EcMetadataIndexingJob( outputFolder, chunkId, dataChunk, queries, spark );
    }

    private static class EcMetadataIndexingJob implements Runnable {

        private final String outputFolder;
        private final int chunkId;
        private final List<String> dataChunk;

        private final SqlQueryMap queries;

        private final SparkSqlWrapper spark;

        EcMetadataIndexingJob(String outputFolder, int chunkId, List<String> dataChunk, SqlQueryMap queries, SparkSqlWrapper spark) {
            this.outputFolder = outputFolder;
            this.chunkId = chunkId;
            this.dataChunk = dataChunk;
            this.queries = queries;
            this.spark = spark;
        }


        @Override
        public void run() {

            String chunkSuffix = "__" + chunkId;
            String jsonStringsTableName = "json_objects_ec_metadata" + chunkSuffix;
            String parsedDataTableName = "ec_metadata" + chunkSuffix;

            spark.ceateTableFromStringCollection( jsonStringsTableName, dataChunk );

            String jsonParsingSql = queries.getQuery("010_FORMAT_EC_METADATA");
            jsonParsingSql = jsonParsingSql.replaceFirst(
                    "json_objects_ec_metadata",
                    jsonStringsTableName
            );

            jsonParsingSql = "create or replace temporary view " + parsedDataTableName + " as \n "
                    + jsonParsingSql;

            spark.execSql( jsonParsingSql );

            spark.execSql( " select * from " + parsedDataTableName )
                    .repartition( 1 )
                    .write().mode(SaveMode.Append).parquet( outputFolder );

            spark.removeTable( parsedDataTableName );
            spark.removeTable( jsonStringsTableName );
        }
    }
}
