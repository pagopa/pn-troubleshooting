package it.pagopa.pn.scripts.commands.config;

import it.pagopa.pn.scripts.commands.config.resolver.EnvironmentResolver;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Java env variables are managed using an immutable map, so to add new variables during test execution
 * we have to use maven-surefire-plugin.
 * Please refer to pom.xml to see and add new env variables.
 * */
public class EnvironmentResolverTest {

    @Test
    public void resolveExistingVariableTest() {

        // Given
        String sql = """
        CREATE OR REPLACE temporary view incremental_timeline
        USING org.apache.spark.sql.parquet
        OPTIONS (
            path "s3a://${CORE_BUCKET}/parquet/pn-Timelines/",
            "parquet.enableVectorizedReader" "false"
        );
        """;

        // When
        String resolved = EnvironmentResolver.resolve(sql);

        // Then
        Assert.assertTrue(resolved.contains("bucket-test"));
        Assert.assertFalse(resolved.contains("${CORE_BUCKET}"));
    }

    @Test
    public void resolveNonExistingVariableTest() {

        // Given
        String sql = """
        CREATE OR REPLACE temporary view incremental_timeline
        USING org.apache.spark.sql.parquet
        OPTIONS (
            path "s3a://${NON_EXISTING_VAR}/parquet/pn-Timelines/",
            "parquet.enableVectorizedReader" "false"
        );
        """;

        // When
        String resolved = EnvironmentResolver.resolve(sql);

        // Then
        Assert.assertFalse(resolved.contains("bucket-test"));
        Assert.assertTrue(resolved.contains("${NON_EXISTING_VAR}"));
    }
}
