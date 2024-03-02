package it.pagopa.pn.scripts.commands;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.*;

public class MainTest {

    @Test
    public void indexSsDocuments() throws IOException {
        String indexEcMetadata = "" +
                "dynamoExportsIndexing " +
                "--aws-profile sso_pn-confinfo-prod " +
                "--aws-bucket dynamodb-export-350578575906-eu-south-1 " +
                "--aws-dynexport-folder-prefix %s/exports/ " +
                "--aws-full-export-folder-suffix 20240108 " +
                "pn-SsDocumenti";
        String commandLine = indexEcMetadata + " 2023-1-1 2023-1-1" ;

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void indexEcMetadata() throws IOException {
        String indexEcMetadata = "" +
                "dynamoExportsIndexing " +
                  "--aws-profile sso_pn-confinfo-prod " +
                  "--aws-bucket dynamodb-export-350578575906-eu-south-1 " +
                  //"--aws-full-export-date 2024-1-15 " +
                  "--aws-dynexport-folder-prefix %s/incremental202401/ " +
                "pn-EcRichiesteMetadati";

        String commandLine = indexEcMetadata + " 2024-2-7 2055-1-1 " ;

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void exportEcMetadata() throws IOException {
        String commandLine = " exportEcRichiesteMetadati";

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void indexAndExportCdc() throws IOException {
        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-prod --aws-bucket pn-logs-bucket-eu-south-1-510769970275-001";
        String commandLine = indexCdcCore + " pn-Notifications 2024-1-7 2024-1-15 " +
                indexCdcCore + " pn-Timelines 2024-1-7 2024-1-15 " ;

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));
        Assert.assertEquals( exitCode, 0 );
    }


    //@Test
    public void incrementalRedoSourceChannelDetails() throws IOException {
        String commandLine = "redoSourceChannelDetails 2024-1-5 2024-1-7 ";

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void exportNotificationWithFix() throws IOException {
        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-prod --aws-bucket pn-logs-bucket-eu-south-1-510769970275-001 ";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                indexCdcCore + " pn-Notifications 2023-06-1 2023-12-1 " +
                "jsonTransform --aws-profile sso_pn-core-prod + fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2023-12-1 2024-1-5 " +
                "jsonTransform - fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2024-1-5 20255-1-1 ";

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void exportTimelineWithFix() throws IOException {
        String env = "prod";
        String awsAccountId = "510769970275";

        System.setProperty("dumpToTmp", "true");

        String indexCdcCore = "cdcIndexing " +
                              " --aws-profile sso_pn-core-" + env + " " +
                              " --aws-bucket pn-logs-bucket-eu-south-1-" + awsAccountId + "-001 " +
                              //" --result-upload-url s3://pn-datamonitoring-eu-south-1-" + awsAccountId + "/parquet/ " +
                              "";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                //"jsonTransform --aws-profile sso_pn-confinfo-" + env + " + fixGeoKey " +
                //indexCdcCore + " pn-Timelines 2023-06-1 2023-9-21 " +
                //"jsonTransform - fixGeoKey " +
                indexCdcCore + " pn-Timelines 2024-2-16 2055-1-1 ";

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void exportTimelineForInvoicingWithFix() throws IOException {
        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-prod --aws-bucket pn-logs-bucket-eu-south-1-510769970275-001 ";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                "jsonTransform --aws-profile sso_pn-confinfo-prod + fixGeoKey " +
                indexCdcCore + " pn-TimelinesForInvoicing 2023-6-1 2024-1-9 " ;

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }
}
