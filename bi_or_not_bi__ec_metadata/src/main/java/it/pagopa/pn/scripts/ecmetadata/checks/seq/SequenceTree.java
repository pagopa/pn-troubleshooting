package it.pagopa.pn.scripts.ecmetadata.checks.seq;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.*;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

public class SequenceTree {

    public static SequenceTree loadFromJson(Path sequenceTree) {
        SequenceTree result;

        if( Files.exists( sequenceTree )) {
            result = doLoadFromJson( sequenceTree );
        }
        else {
            result = new SequenceTree();
        }
        return result;
    }

    private static SequenceTree doLoadFromJson(Path sequenceTree) {
        try {
            String jsonStr = Files.readString(sequenceTree);
            JSONObject jsonObj = new JSONObject( jsonStr );
            return SequenceTree.fromJsonObj( jsonObj );
        }
        catch (IOException | JSONException e ) {
            throw new RuntimeException( e );
        }
    }

    private static SequenceTree fromJsonObj(JSONObject jsonObj) throws JSONException {
        SequenceTree tree = new SequenceTree();

        Iterator<String> keys = jsonObj.keys();
        while( keys.hasNext() ) {
            String key = keys.next();

            JSONObject childJsonObject = jsonObj.getJSONObject(key);
            SequenceNode child = SequenceNode.fromJson( key, childJsonObject );

            tree.productsSeq.put( key, child);
        }
        return tree;
    }


    private SortedMap<String, SequenceNode> productsSeq = new TreeMap<>();

    public void addSequence( RawEventSequence seq ) {

        String product = seq.getProduct();

        SequenceNode rootNode = productsSeq.computeIfAbsent(product, SequenceNode::newEmptyNode );
        rootNode.add( seq );
    }

    public List<RawEventSequence> getSequences() {
        List<RawEventSequence> result = new ArrayList<>();
        for( String product: productsSeq.keySet() ) {
            productsSeq.get( product ).listSequences( product, null, result );
        }
        return result;
    }




    public void writeToJson(Path sequenceTree) {
        try {
            Files.writeString( sequenceTree, this.toJson(), StandardOpenOption.CREATE );
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public String toJson() {
        boolean isFirstLine = true;
        StringBuilder strBuilder = new StringBuilder();

        strBuilder.append("{\n");
        for(Map.Entry<String, SequenceNode> entry: productsSeq.entrySet() ) {

            if( !isFirstLine ) {
                strBuilder.append(",\n");
            }

            strBuilder.append("  \"").append( entry.getKey() ).append("\": {\n");
            entry.getValue().printJson( 4, strBuilder );
            strBuilder.append("  }");

            isFirstLine = false;
        }
        strBuilder.append("\n}");
        return strBuilder.toString();
    }


    private static class SequenceNode {

        public static final String COMMON_PROPERTY_PREFIX = "_";
        public static final String STAGE_PROPERTY_NAME = "_stage";
        public static final String CARDINALITY_PROPERTY_NAME = "_cardinality";

        private static SequenceNode newEmptyNode(String key ) {
            return new SequenceNode( key, 0);
        }

        public static SequenceNode fromJson( String key, JSONObject jsonObj ) throws JSONException {
            SequenceNode node = newEmptyNode( key );

            Iterator<String> childrenKeys = jsonObj.keys();
            while( childrenKeys.hasNext() ) {
                String childKey = childrenKeys.next();

                if( childKey.startsWith( COMMON_PROPERTY_PREFIX ) ) {
                    if ( STAGE_PROPERTY_NAME.equals( childKey ) ) {
                        node.stage = jsonObj.getString(STAGE_PROPERTY_NAME);
                    }
                }
                else {
                    JSONObject childJsonObject = jsonObj.getJSONObject( childKey );
                    SequenceNode child = SequenceNode.fromJson( childKey, childJsonObject );
                    node.children.put( childKey, child);
                }
            }
            return node;
        }


        public SequenceNode(String key, long cardinality) {
            this.children = new TreeMap<>();
            this.cardinality = cardinality;
            this.key = key;
        }

        private SortedMap<String, SequenceNode> children;

        private long cardinality;

        public long getCardinality() {
            return cardinality;
        }

        private String key;
        public String getKey() {
            return key;
        }

        private String stage;

        public String getStage() {
            return stage;
        }

        public void setStage(String stage) {
            this.stage = stage;
        }

        private void add(RawEventSequence seq ) {
            this.cardinality += seq.getCardinality();

            List<String> seqCodes = seq.getCodes();
            if( seqCodes.size() > 0 ) {

                String childKey = seqCodes.get( 0 );

                this.children.computeIfAbsent( childKey, SequenceNode::newEmptyNode )
                        .add( seq.removeFirstCode() );
            }
        }

        /**
         *
         * @param product
         * @param prefix <code>null</code> prefixes means &quot;skip sequence&quot;
         * @param list
         */
        public void listSequences(String product, String prefix, List<RawEventSequence> list ) {
            String seq;
            if( prefix == null ) { // - Skip first level because the key repeat the product name
                seq = "";
            }
            else {
                seq = ( prefix + " " + key ).trim();

                RawEventSequence mySequence = RawEventSequence.fromString( product, seq, cardinality );
                mySequence.setStage( this.getStage() );
                list.add( mySequence );
            }

            for( String childKey: children.keySet() ) {
                children.get( childKey ).listSequences( product, seq, list );
            }
        }

        private void printJson(int indent, StringBuilder strBuilder) {
            char[] prefix = new char[ indent ];
            Arrays.fill( prefix, ' ');

            strBuilder
                    .append( prefix ).append("\"" + CARDINALITY_PROPERTY_NAME + "\": ").append( cardinality ).append(",\n")
                    .append( prefix ).append("\"" + STAGE_PROPERTY_NAME + "\": ");
            writeStageValue( strBuilder );

            for(Map.Entry<String, SequenceNode> entry: children.entrySet() ) {

                strBuilder.append(",\n");
                strBuilder.append( prefix ).append("\"").append( entry.getKey() ).append("\": {\n");
                entry.getValue().printJson( indent + 4, strBuilder );
                strBuilder.append( prefix ).append("}");
            }

            strBuilder.append("\n");
        }

        private void writeStageValue(StringBuilder strBuilder) {
            if( stage == null ) {
                strBuilder.append("null");
            }
            else {
                strBuilder.append("\"").append( stage ).append("\"");
            }
        }

    }
}
