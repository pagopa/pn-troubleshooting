package it.pagopa.pn.scripts.commands;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.*;

public class MainTest {



    @Test
    public void indexAndExport() throws IOException {
        String commandLine = "dynamoExportsIndexing pn-EcRichiesteMetadati 2024-1-3 2024-1-4 ";
          //+ " exportEcRichiesteMetadati";

        //String commandLine = "cdcIndexing pn-Notifications 2024-1-3 2024-1-4 " +
        //        "cdcIndexing pn-Timelines 2024-1-3 2024-1-4 " ; //+
        //        "redoSourceChannelDetails 2024-1-3 2024-1-4 ";

        //String commandLine = "redoSourceChannelDetails 2023-12-20 2024-1-3 ";
        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

}
