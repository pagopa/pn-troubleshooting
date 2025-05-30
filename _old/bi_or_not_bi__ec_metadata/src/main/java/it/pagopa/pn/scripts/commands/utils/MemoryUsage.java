package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.logs.LoggerFactory;

import java.util.logging.Logger;

public class MemoryUsage {
    private static final Logger log = LoggerFactory.getLogger();

    private MemoryUsage() {
        // Prevent instantiation
    }

    public static void printMemoryUsage() {
        long maxMemory = Runtime.getRuntime().maxMemory();
        long totalMemory = Runtime.getRuntime().totalMemory();
        long freeMemory = Runtime.getRuntime().freeMemory();
        long usedMemory = totalMemory - freeMemory;
        
        long maxMemoryMB = maxMemory / (1024L * 1024L);
        long totalMemoryMB = totalMemory / (1024L * 1024L);
        long freeMemoryMB = freeMemory / (1024L * 1024L);
        long usedMemoryMB = usedMemory / (1024L * 1024L);

        String logString = "\nMax memory for this JVM: " + maxMemoryMB + "MB\n" +
                "Max memory for this JVM: " + maxMemoryMB + "MB\n" +
                "Total memory allocated: " + totalMemoryMB + "MB\n" +
                "Free memory available: " + freeMemoryMB + "MB\n" +
                "Currently used memory: " + usedMemoryMB + "MB\n";
        log.info(logString);
    }
}
