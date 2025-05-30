package it.pagopa.pn.scripts.commands.sparksql;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class SqlQueryHolder {

    private String name;
    private String location;
    private String sqlQuery;
    private Boolean persist;
    private Set<SqlQueryDependency> dependencies = new HashSet<>();

    private boolean isEntryPoint;

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

    public Boolean isPersist() {
        return persist;
    }

    public void setPersist(Boolean persist) {
        this.persist = persist;
    }

    public Boolean isEntryPoint() {
        return isEntryPoint;
    }

    public void setEntryPoint(Boolean entryPoint) {
        isEntryPoint = entryPoint;
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
        return Objects.hash(name, location);
    }

    @Override
    public String toString() {
        return "SqlQueryHolder{" +
            "dependencies=" + dependencies +
            ", name='" + name + '\'' +
            '}';
    }
}
