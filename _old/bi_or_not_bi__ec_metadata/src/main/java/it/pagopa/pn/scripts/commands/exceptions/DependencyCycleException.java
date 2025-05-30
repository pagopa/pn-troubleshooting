package it.pagopa.pn.scripts.commands.exceptions;

public class DependencyCycleException extends AbstractException{
    public DependencyCycleException(String message) {
        super(message);
    }

    public DependencyCycleException(String message, Throwable throwable) {
        super(message, throwable);
    }
}
