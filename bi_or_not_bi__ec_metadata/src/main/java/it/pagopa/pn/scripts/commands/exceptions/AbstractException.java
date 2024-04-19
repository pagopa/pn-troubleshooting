package it.pagopa.pn.scripts.commands.exceptions;

public abstract class AbstractException extends RuntimeException {

    protected String message;
    protected Throwable throwable;

    protected AbstractException(String message) {
        this.message = message;
    }

    protected AbstractException(String message, Throwable throwable) {
        this.message = message;
        this.throwable = throwable;
    }
}
