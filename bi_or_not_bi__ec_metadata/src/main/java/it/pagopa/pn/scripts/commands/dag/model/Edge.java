package it.pagopa.pn.scripts.commands.dag.model;

import java.util.Objects;

public class Edge {

    private Vertex source;
    private Vertex target;

    /* GETTER & SETTER */

    public void setSource(Vertex source) {
        this.source = source;
    }

    public void setTarget(Vertex target) {
        this.target = target;
    }

    public Vertex getSource() {
        return source;
    }

    public Vertex getTarget() {
        return target;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;

        Edge edge = (Edge) o;
        return Objects.equals(source.getId(), edge.source.getId()) && Objects.equals(target.getId(), edge.target.getId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(source, target);
    }
}