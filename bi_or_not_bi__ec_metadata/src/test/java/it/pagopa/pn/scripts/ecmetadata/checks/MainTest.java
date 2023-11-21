package it.pagopa.pn.scripts.ecmetadata.checks;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.*;

public class MainTest {



    @Test
    public void indexAndExport() throws IOException {
        String commandLine = /*"index 20231120 " + */ "export";
        int exitCode = EcMetadataAnalisysMain.doMain( commandLine.split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

}
