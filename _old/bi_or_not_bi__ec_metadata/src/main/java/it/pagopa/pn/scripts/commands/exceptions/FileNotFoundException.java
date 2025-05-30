package it.pagopa.pn.scripts.commands.exceptions;

public class FileNotFoundException extends AbstractException {

    public FileNotFoundException(String message) {
        super(message);
    }

    public FileNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }

}
