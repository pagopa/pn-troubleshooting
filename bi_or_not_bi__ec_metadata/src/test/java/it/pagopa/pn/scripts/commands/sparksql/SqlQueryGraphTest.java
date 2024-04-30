package it.pagopa.pn.scripts.commands.sparksql;

import org.testng.Assert;
import org.testng.annotations.Test;

public class SqlQueryGraphTest {
    @Test
    public void fromClasspathResourceTest() {

        // Given
        String sourceBasePath = "";
        String sqlResourceName = "./testgraph/file0.sql";
        String queryName = "query00";

        // When
        SqlQueryDag sqlQueryGraph = SqlQueryDag.fromResource(sqlResourceName, queryName, sourceBasePath);

        // Then
        Assert.assertNotNull(sqlQueryGraph);
        Assert.assertEquals(sqlQueryGraph.size(), 8);
        // sqlQueryGraph.forEach(n -> System.out.println(n.toString()));
    }
}
