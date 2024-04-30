package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.dag.TaskRunner;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.HashSet;

public class SqlQueryGraphTest {
    @Test
    public void fromClasspathResourceTest() {

        // Given
        String sqlResourceName = "./testgraph/file0.sql";

        // When
        SqlQueryDag sqlQueryGraph = new SqlQueryDag(sqlResourceName, "query0", "", true);

        // Test
//        Assert.assertNotNull(sqlQueryMap);
//        Assert.assertEquals(sqlQueryMap.getQueriesNames().size(), 4);
        sqlQueryGraph.forEach(n -> System.out.println(n.toString()));

//        TaskRunner.depthFirstSearch(sqlQueryGraph.getDag(), sqlQueryGraph.getQuery(sqlResourceName, "query0"), new HashSet<>());

    }
}
