package it.pagopa.pn.scripts.commands.enumerations;

public enum SchemaEnum {
    S3A("s3a://");

    private final String schema;

    public String getSchema() {
        return schema;
    }

    SchemaEnum(String schema) {
        this.schema = schema;
    }
}
