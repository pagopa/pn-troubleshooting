package it.pagopa.pn.scripts.commands.logs;

import java.util.Arrays;
import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;

public final class LoggerFactory {

    private LoggerFactory() {}

    public static Logger getLogger() {
        return LoggerFactory.getLogger(Logger.GLOBAL_LOGGER_NAME, Level.INFO);
    }

    public static Logger getLogger(String name) {
        return LoggerFactory.getLogger(name, Level.INFO);
    }

    public static Logger getLogger(String name, Level level) {
        Logger logger = Logger.getLogger(name);

        Arrays.stream(logger.getHandlers()).forEach(logger::removeHandler);

        logger.addHandler(new ConsoleHandler());
        logger.setLevel(level);
        logger.setUseParentHandlers(false);

        return logger;
    }
}
