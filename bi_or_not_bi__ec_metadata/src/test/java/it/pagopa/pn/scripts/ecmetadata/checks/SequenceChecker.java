package it.pagopa.pn.scripts.ecmetadata.checks;

import it.pagopa.pn.scripts.ecmetadata.checks.seq.RawEventSequence;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.SequenceSummaryParser;
import it.pagopa.pn.scripts.ecmetadata.checks.seq.SequenceTree;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class SequenceChecker {

    private static final Path SEQUENCE_SUMMARY = Paths.get("out/extraction/summary.csv");

    private static final Path SEQUENCE_TREE = Paths.get("out/sequence_tree.json");

    @Test
    public void test() throws IOException {
        SequenceTree tree = SequenceTree.loadFromJson( SEQUENCE_TREE );

        List<RawEventSequence> seqs = SequenceSummaryParser.loadSequences( SEQUENCE_SUMMARY );
        for( RawEventSequence seq: seqs ) {
            tree.addSequence( seq );
        }

        tree.writeToJson( SEQUENCE_TREE );
    }

}
