package it.pagopa.pn.scripts.commands.indexing;


import java.nio.file.Path;

public interface JobWithOutput extends Runnable {

    Path outputFolder();

}
