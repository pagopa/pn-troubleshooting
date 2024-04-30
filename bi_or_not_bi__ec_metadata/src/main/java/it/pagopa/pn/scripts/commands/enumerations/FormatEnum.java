package it.pagopa.pn.scripts.commands.enumerations;

public enum FormatEnum {
    CSV("csv"),
    PARQUET("parquet"),
    JSON("json");

    private final String extension;

    public String getExtension() {
        return extension;
    }

    FormatEnum(String extension) {
        this.extension = extension;
    }
}
