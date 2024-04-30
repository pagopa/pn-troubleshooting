package it.pagopa.pn.scripts.commands.sparksql;

import org.testng.Assert;
import org.testng.annotations.Test;

public class SqlQueryGraphTest {
    @Test
    public void fromClasspathResourceTest() {

        // Given
        String sqlResourceName = "./testgraph/file0.sql";
        String queryName = "query00";

        // When
        SqlQueryDag sqlQueryGraph = new SqlQueryDag(sqlResourceName, queryName, true);

        // Then
        Assert.assertNotNull(sqlQueryGraph);
        Assert.assertEquals(sqlQueryGraph.size(), 8);
        // sqlQueryGraph.forEach(n -> System.out.println(n.toString()));
    }
}
