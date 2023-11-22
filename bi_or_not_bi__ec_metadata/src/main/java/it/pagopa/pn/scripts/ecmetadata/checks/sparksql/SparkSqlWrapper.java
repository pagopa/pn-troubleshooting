package it.pagopa.pn.scripts.ecmetadata.checks.sparksql;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.Msg;
import it.pagopa.pn.scripts.ecmetadata.checks.logs.MsgSenderSupport;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.RawEventSequence;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.*;

import java.io.IOException;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class SparkSqlWrapper extends MsgSenderSupport {

    public static SparkSqlWrapper localSingleCore( String appicationName ) {
        return new SparkSqlWrapper( appicationName, 1 );
    }

    public static SparkSqlWrapper localMultiCore( String appicationName ) {
        return new SparkSqlWrapper( appicationName, Runtime.getRuntime().availableProcessors() );
    }

    private final SparkSession spark;
    private final JavaSparkContext sparkContext;
    private final SQLContext sqlContext;

    private final ThreadPoolExecutor jobWorkers;

    private SparkSqlWrapper(String applicationName, int     cores) {
        spark = SparkSession.builder()
                .appName( applicationName )
                .master("local[" + cores + "]")
                .getOrCreate();
        sparkContext = new JavaSparkContext( spark.sparkContext() );
        sqlContext = spark.sqlContext();

        jobWorkers = new ThreadPoolExecutor( 1, 1,
                                   1, TimeUnit.MINUTES, new LinkedBlockingQueue<>());
    }

    public Dataset<Row> execSql(String sql) {
        return sqlContext.sql( sql );
    }

    public void addJob( String name, Runnable job ) {
        fireMessage(Msg.jobScheduled( name ));

        jobWorkers.execute(() -> {

            fireMessage(Msg.jobStart( name ));
            try {
                job.run();
            }
            finally {
                fireMessage(Msg.jobDone( name ));
            }
        });
    }

    public void shutdown(long timeout, TimeUnit unit) {
        try {
            jobWorkers.shutdown();
            jobWorkers.awaitTermination( timeout, unit );
            sparkContext.stop();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }

    public void removeTable(String tableName) {
        sqlContext.dropTempTable( tableName );
    }

    public void tableToCsvSingleFile( String tableName, Path csvFile ) {
        Dataset<Row> tableContent = sqlContext.table( tableName );

        String headers = String.join( ",", tableContent.columns() );

        Stream<String> body = tableContent.collectAsList()
                .stream()
                .map( row -> row.mkString(", ") );

        Stream<String> csvLines = Stream.concat( Stream.of( headers ), body );

        try {
            Files.write( csvFile, (Iterable<String>) csvLines::iterator,
                                             StandardCharsets.UTF_8, StandardOpenOption.CREATE );
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public <T> Stream<T> tableToBeanStream(String tableName, Class<T> beanClass) {

        Encoder<T> encoder = Encoders.bean( beanClass );

        return sqlContext.table( tableName )
                .as( encoder )
                .collectAsList()
                .stream();
    }

    public void readParquetTable( Path folder, String tableName) {
        spark.read().parquet( folder.toString() )
                .createOrReplaceTempView( tableName );
    }

    public void ceateTableFromStringCollection( String tableName, List<String> lines ) {
        spark.createDataFrame(
                sparkContext.parallelize(
                        lines.stream().map(l -> new LineHolder(l)).collect(Collectors.toList())
                    ),
                LineHolder.class
            )
            .createOrReplaceTempView( tableName );
    }

    public void temporaryTableFromBeanCollection(String tableName, List<RawEventSequence> list, Class<RawEventSequence> beanClass) {
        spark.createDataFrame( sparkContext.parallelize( list ), beanClass )
                .createOrReplaceTempView( tableName );
    }

    public void writeTableToParquet(String tableName, Path parquetOut ) {
        spark.table( tableName ).write().parquet( parquetOut.toString() );
    }


    public static final class LineHolder implements Serializable {


        private String json_string;

        private LineHolder( String json_string ) {
            this.json_string = json_string;
        }

        public String getJson_string() {
            return json_string;
        }

        public void setJson_string(String json_string) {
            this.json_string = json_string;
        }
    }


}
