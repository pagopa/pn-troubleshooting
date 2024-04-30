package it.pagopa.pn.scripts.commands.sparksql;

import org.apache.spark.SparkConf;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class SparkSqlWrapperTest {

    private static final String SPARK_APP = SparkSqlWrapperTest.class.getName();
    private static final String S3_BUCKET = "test-bucket";

    private SparkSqlWrapper sparkSqlWrapper;

    @BeforeMethod
    public void init() {

        SparkConf sparkConf = new SparkConf();
        sparkConf.set("spark.hadoop.fs.s3a.endpoint", "http://localhost:4566");
        sparkConf.set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem");
        sparkConf.set("spark.hadoop.fs.s3a.path.style.access", "true");
        sparkConf.set("spark.hadoop.fs.s3a.secret.key", "test");
        sparkConf.set("spark.hadoop.fs.s3a.access.key", "test");

        this.sparkSqlWrapper = SparkSqlWrapper.local(SPARK_APP, sparkConf, false);
    }

    @Test
    public void s3aReadSampleCSVTest() {

        // Given
        String file = "sample.csv";

        String sqlTempView = String.format("""
            CREATE OR REPLACE TEMPORARY VIEW test
            USING csv
            OPTIONS (
              path "s3a://%s/%s",
              header true
            );""", S3_BUCKET, file
        );

        String sqlSelectAll = "SELECT * FROM test";

        // When
        Dataset<Row> tempViewResult = this.sparkSqlWrapper.execSql(sqlTempView);
        Dataset<Row> selectAllResult = this.sparkSqlWrapper.execSql(sqlSelectAll);

        // Then
        Assert.assertNotNull(tempViewResult);
        Assert.assertNotNull(selectAllResult);

        Assert.assertEquals(selectAllResult.count(), 9);
    }
}
