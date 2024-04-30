package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.enumerations.FormatEnum;
import it.pagopa.pn.scripts.commands.utils.SparkDatasetWriter;
import org.apache.spark.SparkConf;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class SparkSqlWrapperTest {

    private static final String SPARK_APP = SparkSqlWrapperTest.class.getName();

    private static final String S3A_SCHEMA_PREFIX = "s3a://";
    private static final String S3_BUCKET = "test-bucket";

    private SparkSqlWrapper sparkSqlWrapper;

    @BeforeMethod
    public void init() {

        SparkConf sparkConf = new SparkConf()
            .set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            .set("spark.hadoop.fs.s3a.path.style.access", "true")
            .set("spark.hadoop.fs.s3a.secret.key", "test")
            .set("spark.hadoop.fs.s3a.access.key", "test")
            .set("spark.hadoop.fs.s3a.endpoint", "http://localhost:4566");

        this.sparkSqlWrapper = SparkSqlWrapper.local(SPARK_APP, sparkConf, false);
    }

    @Test
    public void s3aSampleCSVTest() {

        // Given
        String file = "sample.csv";
        String out = "select_from_sample.csv";

        String sqlTempView = String.format("""
            CREATE OR REPLACE TEMPORARY VIEW test
            USING csv
            OPTIONS (
              path "%s%s/%s",
              header true
            );""", S3A_SCHEMA_PREFIX, S3_BUCKET, file
        );

        String sqlSelectAll = "SELECT * FROM test";

        // When
        Dataset<Row> tempViewResult = this.sparkSqlWrapper.execSql(sqlTempView);
        Dataset<Row> selectAllResult = this.sparkSqlWrapper.execSql(sqlSelectAll);

        SparkDatasetWriter.writeDataset(
            selectAllResult,
            S3A_SCHEMA_PREFIX + S3_BUCKET + "/" + out,
            FormatEnum.CSV,
            SaveMode.Overwrite
        );

        // Then
        Assert.assertNotNull(tempViewResult);
        Assert.assertNotNull(selectAllResult);

        Assert.assertEquals(selectAllResult.count(), 9);
    }
}
