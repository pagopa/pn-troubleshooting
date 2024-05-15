package it.pagopa.pn.scripts.commands.caching;

import it.pagopa.pn.scripts.commands.enumerations.FormatEnum;
import it.pagopa.pn.scripts.commands.logs.LoggerFactory;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import it.pagopa.pn.scripts.commands.utils.SparkDatasetWriter;
import org.apache.commons.io.FileUtils;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class SparkCacheManager implements CacheManager<Dataset<Row>> {

    private static final Logger log = LoggerFactory.getLogger();

    private static final String CACHE_SQL_QUERY = "Select * from %s";
    private static final String CACHE_LOCATION = "/tmp/spark/cache/%s";

    private final Map<String, Dataset<Row>> viewDatasetMap = new ConcurrentHashMap<>();

    public void persist(SparkSqlWrapper spark, String view) {

        log.info(() -> String.format("Persisting view: %s", view));

        Dataset<Row> dataset = spark.execSql(String.format(CACHE_SQL_QUERY, view));
        // this.put(view, dataset);

        spark.temporaryTableFromDataset(view, dataset);
    }

    @Override
    public Dataset<Row> get(String key) {
        return this.viewDatasetMap.get(key);
    }

    @Override
    public void put(String key, Dataset<Row> value) {
        String outLocation = String.format(CACHE_LOCATION, key);

        try {
            SparkDatasetWriter.builder()
                .dataset(value)
                .outLocation(outLocation)
                .format(FormatEnum.PARQUET)
                .saveMode(SaveMode.Overwrite)
                .build()
                .write();

            this.viewDatasetMap.put(key, value);
        } catch (RuntimeException e) {
            log.severe(() -> String.format("Error while caching view: %s with exception: %s", key, e.getMessage()));
        }
    }

    @Override
    public void remove(String key) {
        try {
            FileUtils.deleteDirectory(new File(String.format(CACHE_LOCATION, key)));
            this.viewDatasetMap.remove(key);
        } catch (IOException e) {
            log.severe(() -> String.format("Error while removing cache view: %s with exception: %s", key, e.getMessage()));
        }
    }

    @Override
    public void removeAll() {
        this.viewDatasetMap.keySet().forEach(this.viewDatasetMap::remove);
    }
}
