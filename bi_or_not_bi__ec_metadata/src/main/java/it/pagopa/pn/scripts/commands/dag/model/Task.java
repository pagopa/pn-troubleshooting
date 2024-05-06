package it.pagopa.pn.scripts.commands.dag.model;

import java.util.Objects;
import java.util.function.Function;

public abstract class Task implements Vertex {

    protected String id;

    protected String name;

    protected Function<Task, Object> job;

    protected Object result;

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

    public void run() {
        result = job.apply(this);
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
}
