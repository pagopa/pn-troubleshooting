package it.pagopa.pn.scripts.commands.aws.dynamo;

record TableMetadata(String tableName, String pk, String sk, PnAccount account) {

    public enum PnAccount {
        CORE,
        CONFINFO
    }
}
