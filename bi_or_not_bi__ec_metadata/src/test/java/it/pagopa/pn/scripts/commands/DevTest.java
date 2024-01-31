package it.pagopa.pn.scripts.commands;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;

public class DevTest {

    @Test
    public void exportNotificationWithFix() throws IOException {

        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-dev " +
                "--aws-bucket pn-logs-bucket-eu-south-1-830192246553-001 " +
                "--result-upload-url s3://dynamo-exports-830192246553-eu-south-1/parquet/ ";

        String fullCommand = " --cdc-indexed-data-folder ./out/prove_dev/cdc " +
                indexCdcCore + " pn-Notifications 2023-06-1 2023-12-1 " +
                "jsonTransform --aws-profile sso_pn-core-dev --flags LENIENT + fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2023-12-1 2024-1-5 " +
                "jsonTransform - fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2024-1-5 2025-1-1 ";

        int exitCode = CommandsMain.doMain( fullCommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


}
