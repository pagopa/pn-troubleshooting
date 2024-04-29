package it.pagopa.pn.scripts.commands.dag.model;

import java.util.Objects;
import java.util.logging.Logger;

public class SQLTask extends Task {

    private static final Logger log = Logger.getLogger(SQLTask.class.getName());

    private String sqlQuery;

    /* CONSTRUCTORS */

    public SQLTask() {}
    public SQLTask(String id, String name, String sqlQuery) {
        this.id = id;
        this.name = name;
        this.sqlQuery = sqlQuery;
    }

    /* GETTER & SETTER */

    public String getSqlQuery() {
        return sqlQuery;
    }

    public void setSqlQuery(String sqlQuery) {
        this.sqlQuery = sqlQuery;
    }

    @Override
    public void run() {
        log.info(() -> "Running SQL task: " + id);
//        log.info(() -> "Running SQL task found in location: " + sqlQuery);
    }

}
