package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.enumerations.FormatEnum;
import org.apache.spark.sql.DataFrameWriter;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public final class SparkDatasetWriter {

    private static final Logger log = LoggerFactory.getLogger(SparkDatasetWriter.class);

    private static final String CSV_HEADER_OPTION = "header";
    private static final String CSV_DELIMITER_OPTION = "delimiter";

    private SparkDatasetWriter() {}

    public static void writeDataset(Dataset<Row> dataset, String out, FormatEnum format, SaveMode saveMode) {

        DataFrameWriter<Row> writer = dataset
            .write()
            .mode(saveMode);

        switch (format) {
            case JSON -> SparkDatasetWriter.writeDatasetToJson(writer, out);
            case PARQUET -> SparkDatasetWriter.writeDatasetToParquet(writer, out);
            default -> SparkDatasetWriter.writeDatasetToCsv(writer, out);
        }
    }

    private static void writeDatasetToCsv(DataFrameWriter<Row> writer, String out) {

        log.info("Writing dataset in CSV to location: {}", out);

        writer
            .option(CSV_HEADER_OPTION, true)
            .option(CSV_DELIMITER_OPTION, ";")
            .csv(out);
    }

    private static void writeDatasetToJson(DataFrameWriter<Row> writer, String out) {

        log.info("Writing dataset in JSON to location: {}", out);

        writer.json(out);
    }

    private static void writeDatasetToParquet(DataFrameWriter<Row> writer, String out) {

        log.info("Writing dataset in PARQUET to location: {}", out);

        writer.parquet(out);
    }

}
