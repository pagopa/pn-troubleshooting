package it.pagopa.pn.scripts.commands.exceptions;

public class EmptyDatasetException extends AbstractException{

    public EmptyDatasetException(String message) {
        super(message);
    }

    public EmptyDatasetException(String message, Throwable throwable) {
        super(message, throwable);
    }
}
