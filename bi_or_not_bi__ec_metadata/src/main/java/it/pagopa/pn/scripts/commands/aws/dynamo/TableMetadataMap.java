package it.pagopa.pn.scripts.commands.aws.dynamo;

import it.pagopa.pn.scripts.commands.aws.dynamo.TableMetadata.PnAccount;

import java.util.HashMap;

import static it.pagopa.pn.scripts.commands.aws.dynamo.TableMetadata.PnAccount.*;

class TableMetadataMap extends HashMap<String, TableMetadata> {

    public static final TableMetadataMap TABLE_METADATA_MAP = new TableMetadataMap()
            .addTableMetadata( "pn-ConfidentialObjects", "hashKey", "sortKey", CONFINFO );

    TableMetadataMap addTableMetadata( TableMetadata meta) {
        this.put(meta.tableName(), meta);
        return this;
    }

    TableMetadataMap addTableMetadata(String tableName, String pk, String sk, PnAccount account) {
        return addTableMetadata(new TableMetadata(tableName, pk, sk, account));
    }

}
