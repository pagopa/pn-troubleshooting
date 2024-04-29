package it.pagopa.pn.scripts.commands.sparksql;

import com.fasterxml.jackson.annotation.JsonProperty;
import it.pagopa.pn.scripts.commands.dag.model.Vertex;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class SqlQueryHolder {

    @JsonProperty(defaultValue = "")
    private String name;
    private String location;
    private String sqlQuery;
    private Set<SqlQueryDependency> dependencies = new HashSet<>();;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getSqlQuery() {
        return sqlQuery;
    }

    public void setSqlQuery(String sqlQuery) {
        this.sqlQuery = sqlQuery;
    }

    public Set<SqlQueryDependency> getDependencies() {
        return dependencies;
    }

    public void setDependencies(Set<SqlQueryDependency> dependencies) {
        this.dependencies = dependencies;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SqlQueryHolder that = (SqlQueryHolder) o;
        return Objects.equals(name, that.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name);
    }

    @Override
    public String toString() {
        return "SqlQueryHolder{" +
            "dependencies=" + dependencies +
            ", name='" + name + '\'' +
            '}';
    }
}
