package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.enumerations.FormatEnum;
import it.pagopa.pn.scripts.commands.logs.LoggerFactory;
import org.apache.spark.sql.DataFrameWriter;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;

import java.util.logging.Logger;


public class SparkDatasetWriter {

    private static final Logger log = LoggerFactory.getLogger();

    private static final String CSV_HEADER_OPTION = "header";
    private static final String CSV_DELIMITER_OPTION = "delimiter";

    private Dataset<Row> dataset;
    private String outLocation;
    private FormatEnum format;
    private SaveMode saveMode;

    private int partitions;

    private SparkDatasetWriter() {}

    public void setDataset(Dataset<Row> dataset) {
        this.dataset = dataset;
    }

    public void setOutLocation(String outLocation) {
        this.outLocation = outLocation;
    }

    public void setFormat(FormatEnum format) {
        this.format = format;
    }

    public void setSaveMode(SaveMode saveMode) {
        this.saveMode = saveMode;
    }

    public void setPartitions(int partitions) {
        this.partitions = partitions;
    }

    public String getOutLocation() {
        return outLocation;
    }

    public FormatEnum getFormat() {
        return format;
    }

    public SaveMode getSaveMode() {
        return saveMode;
    }

    public int getPartitions() {
        return partitions;
    }

    public static SparkDatasetWriterBuilder builder() {
        return new SparkDatasetWriterBuilder();
    }

    public void write() {

        Dataset<Row> df = this.partitions > 0
            ? this.dataset.repartition(this.partitions)
            : this.dataset;

        DataFrameWriter<Row> writer = df
            .write()
            .mode(this.saveMode);

        switch (this.format) {
            case JSON -> this.writeDatasetToJson(writer, this.outLocation);
            case PARQUET -> this.writeDatasetToParquet(writer, this.outLocation);
            default -> this.writeDatasetToCsv(writer, this.outLocation);
        }

        log.info(() -> "Dataset written to " + this.outLocation);
    }

    private void writeDatasetToCsv(DataFrameWriter<Row> writer, String out) {

        log.info(() -> "Writing dataset in CSV to location " + out);

        writer
            .option(CSV_HEADER_OPTION, true)
            .option(CSV_DELIMITER_OPTION, ";")
            .csv(out);
    }

    private void writeDatasetToJson(DataFrameWriter<Row> writer, String out) {

        log.info(() -> "Writing dataset in JSON to location " + out);

        writer.json(out);
    }

    private void writeDatasetToParquet(DataFrameWriter<Row> writer, String out) {

        log.info(() -> "Writing dataset in PARQUET to location: " + out);

        writer.parquet(out);
    }

    public static class SparkDatasetWriterBuilder {

        private Dataset<Row> dataset;
        private String outLocation;
        private FormatEnum format;
        private SaveMode saveMode;

        private int partitions;

        public SparkDatasetWriterBuilder dataset(Dataset<Row> dataset) {
            this.dataset = dataset;
            return this;
        }

        public SparkDatasetWriterBuilder outLocation(String outLocation) {
            this.outLocation = outLocation;
            return this;
        }

        public SparkDatasetWriterBuilder format(FormatEnum format) {
            this.format = format;
            return this;
        }

        public SparkDatasetWriterBuilder saveMode(SaveMode saveMode) {
            this.saveMode = saveMode;
            return this;
        }

        public SparkDatasetWriterBuilder partitions(int partitions) {
            this.partitions = partitions;
            return this;
        }

        public SparkDatasetWriter build() {
            SparkDatasetWriter sparkDatasetWriter = new SparkDatasetWriter();

            sparkDatasetWriter.setDataset(dataset);
            sparkDatasetWriter.setOutLocation(this.outLocation);
            sparkDatasetWriter.setFormat(this.format);
            sparkDatasetWriter.setSaveMode(this.saveMode);
            sparkDatasetWriter.setPartitions(this.partitions);

            return sparkDatasetWriter;
        }
    }
}
