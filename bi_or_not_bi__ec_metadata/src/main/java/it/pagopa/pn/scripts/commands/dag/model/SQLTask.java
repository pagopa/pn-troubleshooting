package it.pagopa.pn.scripts.commands.dag.model;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;

import java.util.function.Function;
import java.util.logging.Logger;

public class SQLTask extends Task {
    private static final Logger log = Logger.getLogger(SQLTask.class.getName());

    private String sqlQuery;

    /* CONSTRUCTORS */

    public SQLTask() {}

    public SQLTask(String id, String name, String sqlQuery, Function<Task, Object> job) {
        this.id = id;
        this.name = name;
        this.sqlQuery = sqlQuery;
        this.job = job;
    }
    public SQLTask(String id, String name, String sqlQuery) {
        this(id, name, sqlQuery, (t) -> {
            log.info(() -> "Running SQLTask: " + id);
            return null;
        });
    }

    /* GETTER & SETTER */

    public String getSqlQuery() {
        return sqlQuery;
    }

    public void setSqlQuery(String sqlQuery) {
        this.sqlQuery = sqlQuery;
    }

}
