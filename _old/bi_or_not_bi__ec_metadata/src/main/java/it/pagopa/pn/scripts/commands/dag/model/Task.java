package it.pagopa.pn.scripts.commands.dag.model;

import it.pagopa.pn.scripts.commands.logs.LoggerFactory;

import java.util.Objects;
import java.util.function.Function;
import java.util.logging.Logger;

public abstract class Task implements Vertex {

    private static final Logger log = LoggerFactory.getLogger();

    protected String id;

    protected String name;

    protected Function<Task, Object> job;

    protected Object result;

    protected Boolean persist;

    /* GETTER & SETTER */

    @Override
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Function<Task, Object> getJob() {
        return job;
    }

    public void setJob(Function<Task, Object> job) {
        this.job = job;
    }

    public Object getResult() {
        return result;
    }
    public <T> T getResult(Class<T> type) {
        return type.cast(result);
    }

    public Boolean isPersist() {
        return persist;
    }

    public void setPersist(Boolean persist) {
        this.persist = persist;
    }

    public void run() {
        log.info("Running task " + getId());
        result = job.apply(this);
        log.info("Task " + getId() + " completed");
    }

    @Override
    public String toString() {
        return "Task{id='" + id + "', name='" + name + "'}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;

        Task task = (Task) o;
        return Objects.equals(id, task.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public static String buildId(String location, String name) {
        return location + "#" + name;
    }
}
