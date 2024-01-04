package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;


import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public class SourceChannelDetailsFromLogCache {

    private final ConcurrentHashMap<String, Optional<String>> notAskedIun = new ConcurrentHashMap<>();


    private final ComputeSourceChannelDetailsFromLog logsClient;

    public SourceChannelDetailsFromLogCache(String profile, String region ) {
        this.logsClient = new ComputeSourceChannelDetailsFromLog( profile, region );
    }

    public Optional<String> computeSourceChannelDetails( String iun, Instant creationTime ) {

        if( ! notAskedIun.containsKey( iun ) ) {

            List<IunDataFromLogEntry> logs = logsClient.extractSourceChannelDetailsMassive(
                    creationTime.minusSeconds( 60 ),
                    creationTime.plusSeconds( 15 * 60)
            );

            logs.stream()
                    .filter( e -> e.resolved() && e.uidAreEquals() )
                    .filter( e -> e.iun() != null )
                    .forEach( el -> notAskedIun.put(
                            el.iun(),
                            Optional.ofNullable( el.sourceChannelDetails() ))
                        );

            if( ! notAskedIun.containsKey( iun ) ) {
                List<IunDataFromLogEntry> logs2 = logsClient.extractSourceChannelDetailsMassive(
                        creationTime.minusSeconds(10),
                        creationTime.plusSeconds(1 * 60)
                );

                logs2.stream()
                        .filter(e -> e.resolved() && e.uidAreEquals())
                        .filter( e -> e.iun() != null )
                        .forEach( el -> notAskedIun.put(
                                el.iun(),
                                Optional.ofNullable( el.sourceChannelDetails() ))
                        );
            }

            if( ! notAskedIun.containsKey( iun ) ) {
                throw new UnsupportedOperationException("DETAILED SEARCH NOT SUPORTED YET");
            }
        }

        return notAskedIun.remove( iun );
    }

}
