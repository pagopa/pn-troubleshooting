package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Path;

public class SqlQueryMapTest {

    @Test
    public void fromClasspathResourceTest() {

        // Given
        String sqlResourceName = "TestExportEcRichiesteMetadati.sql";

        // When
        SqlQueryMap sqlQueryMap = SqlQueryMap.fromClasspathResource(sqlResourceName);

        // Test
        Assert.assertNotNull(sqlQueryMap);
        Assert.assertEquals(sqlQueryMap.getQueriesNames().size(), 4);
    }

    @Test
    public void fromPathTest() throws URISyntaxException {

        // Given
        URL url = getClass().getClassLoader().getResource("TestExportEcRichiesteMetadati.sql");
        assert url != null;

        Path sqlPath = Path.of(url.toURI());

        // When
        SqlQueryMap sqlQueryMap = SqlQueryMap.fromPath(sqlPath);

        // Test
        Assert.assertNotNull(sqlQueryMap);
        Assert.assertEquals(sqlQueryMap.getQueriesNames().size(), 4);
    }

    @Test
    public void fromNonExistingClasspathResourceTest() {

        // Given
        String sqlResourceName = "NotExistingResource.sql";

        // When - Then
        Assert.assertThrows(SQLParsingException.class, () -> SqlQueryMap.fromClasspathResource(sqlResourceName));
    }

    @Test
    public void fromNonExistingPathTest() {

        // Given
        Path sqlPath = Path.of("NotExistingResource.sql");

        // When - Then
        Assert.assertThrows(SQLParsingException.class, () -> SqlQueryMap.fromPath(sqlPath));
    }
}
