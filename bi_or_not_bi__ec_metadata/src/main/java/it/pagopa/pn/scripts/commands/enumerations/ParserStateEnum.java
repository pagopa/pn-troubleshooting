package it.pagopa.pn.scripts.commands.enumerations;

public enum ParserStateEnum {
    READY,
    BEGIN_QUERY_DEFINITION,
    READING_METADATA,
    READING_QUERY,
    END_QUERY_DEFINITION
}
