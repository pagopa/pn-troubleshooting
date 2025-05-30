package it.pagopa.pn.scripts.commands.exports.ec_metadata.seq;

import java.io.Serializable;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class RawEventSequence implements Serializable {

    public static RawEventSequence fromString( String product, String seq, long cardinality ) {
        List<String> codeList = Arrays.asList(seq.trim().split(" +"));
        return new RawEventSequence( product, codeList, cardinality );
    }

    private RawEventSequence( String product, List<String> codes, long cardinality) {
        this.product = product;
        this.codes = Collections.unmodifiableList( codes );
        this.cardinality = cardinality;
    }

    public RawEventSequence removeFirstCode() {
        List<String> childCodes = codes.subList(1, codes.size());

        return new RawEventSequence( product, childCodes, cardinality);
    }

    private String product;
    public String getProduct() {
        return product;
    }

    private List<String> codes;
    public List<String> getCodes() {
        return codes;
    }

    private long cardinality;
    public long getCardinality() {
        return cardinality;
    }

    private String stage;
    public String getStage() {
        return stage;
    }
    public void setStage(String stage) {
        this.stage = stage;
    }
}
