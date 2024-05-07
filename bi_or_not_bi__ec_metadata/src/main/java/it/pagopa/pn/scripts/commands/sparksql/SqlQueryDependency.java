package it.pagopa.pn.scripts.commands.sparksql;

import java.util.Objects;

public class SqlQueryDependency {

    private String name;
    private String location;

    public SqlQueryDependency() {}

    public SqlQueryDependency(String name, String location) {
        this.name = name;
        this.location = location;
    }

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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SqlQueryDependency that = (SqlQueryDependency) o;
        return Objects.equals(name, that.name) && Objects.equals(location, that.location);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, location);
    }

    @Override
    public String toString() {
        return "SqlQueryDependency{" +
            "name='" + name + '\'' +
            ", location='" + location + '\'' +
            '}';
    }
}
