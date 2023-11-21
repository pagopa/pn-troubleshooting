package it.pagopa.pn.scripts.ecmetadata.checks.seq;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class SequenceSummaryParser {

    public static List<RawEventSequence> loadSequences(Path sequenceFile ) {
        SequenceSummaryParser parser = new SequenceSummaryParser( sequenceFile );

        parser.loadSequences();
        return parser.getSequences();
    }

    private final Path filePath;

    private int productColumn = -1;
    private int sequenceColumn = -1;
    private int cardinalityColumn = -1;

    private List<RawEventSequence> sequences;

    public List<RawEventSequence> getSequences() {
        return sequences;
    }

    private SequenceSummaryParser(Path sequenceFile) {
        this.filePath = sequenceFile;
    }

    private void loadSequences() {
        try {
            boolean isFirstLine = true;
            for( String line: (Iterable<String>) Files.lines( filePath )::iterator ) {
                line = line.trim();

                if( line.length() > 0 ) {
                    if ( isFirstLine ) {
                        parseHeader( line );

                        this.sequences = new ArrayList<>();
                    }
                    else {
                        parseBodyLine( line );
                    }
                    isFirstLine = false;
                }
            }
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private void parseBodyLine(String line) {
        String[] cells = line.split(" *, *");

        String product = cells[ this.productColumn ];
        String seq = cells[ this.sequenceColumn ];
        long cardinality = Long.valueOf( cells[ this.cardinalityColumn ] );

        RawEventSequence sequence = RawEventSequence.fromString(product, seq, cardinality);
        this.sequences.add( sequence );
    }

    private void parseHeader(String line) {
        List<String> headers = Arrays.asList( line.split(" *, *") );

        this.productColumn = headers.indexOf( "paperMeta_productType" );
        this.sequenceColumn = headers.indexOf( "statuses_string" );
        this.cardinalityColumn = headers.indexOf( "cardinality" );
    }
}
