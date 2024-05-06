package it.pagopa.pn.scripts.commands.exceptions;

public class SQLParsingException extends AbstractException {

    public SQLParsingException(String message) {
        super(message);
    }

    public SQLParsingException(String message, Throwable cause) {
        super(message, cause);
    }
}
