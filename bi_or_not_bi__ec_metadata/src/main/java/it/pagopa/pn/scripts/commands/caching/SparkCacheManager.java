package it.pagopa.pn.scripts.commands.caching;

import it.pagopa.pn.scripts.commands.logs.LoggerFactory;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class SparkCacheManager implements CacheManager<Dataset<Row>> {

    private static final Logger log = LoggerFactory.getLogger();

    private static final String CACHE_SQL_QUERY = "Select * from %s";

    private final Map<String, Dataset<Row>> viewDatasetMap = new ConcurrentHashMap<>();

    /**
     * Execute <pre>Select * from <i>view</i></pre> in order to materialize temporary view data
     * and creates a new temporary view using materialized ones avoiding re-executing the view each time
     *
     * @param spark wrapper holding spark context
     * @param view  view to persist
     *
     * */
    public void persist(SparkSqlWrapper spark, String view) {

        log.info(() -> String.format("Persisting view: %s", view));

        Dataset<Row> dataset = spark.execSql(String.format(CACHE_SQL_QUERY, view));
        spark.temporaryTableFromDataset(view, dataset);

        this.put(view, dataset);
    }

    @Override
    public Dataset<Row> get(String key) {
        return this.viewDatasetMap.get(key);
    }

    @Override
    public void put(String key, Dataset<Row> value) {
        this.viewDatasetMap.put(key, value);
    }

    @Override
    public void remove(String key) {
        this.viewDatasetMap.remove(key);
    }

    @Override
    public void removeAll() {
        this.viewDatasetMap.keySet().forEach(this.viewDatasetMap::remove);
    }
}
