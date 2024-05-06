package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Edge;
import it.pagopa.pn.scripts.commands.dag.model.Task;

import java.util.HashSet;
import java.util.Set;

/**
 * Builder for {@link TaskDag} class
 * */
public final class TaskDagBuilder {

    private final Set<Task> vertices;
    private final Set<Edge> edges;

    private TaskDagBuilder() {
        this.vertices = new HashSet<>();
        this.edges = new HashSet<>();
    }

    public static TaskDagBuilder builder() {
        return new TaskDagBuilder();
    }

    public TaskDag build() {
        var taskDag = new TaskDag();

        this.vertices.forEach(taskDag::addTask);
        this.edges.forEach(e -> taskDag.addDependency((Task) e.getSource(),(Task) e.getTarget()));

        return taskDag;
    }

    public TaskDagBuilder addTask(Task task) {
        this.vertices.add(task);
        return this;
    }

    public TaskDagBuilder addDependency(Edge edge) {
        this.edges.add(edge);
        return this;
    }
}
