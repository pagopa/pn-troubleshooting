package it.pagopa.pn.scripts.commands.utils;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Stream;

public class StreamUtils {

    private StreamUtils() {}

    public static Stream<String> oneJsonObjectPerLine( Stream<String> in ) {
        Function<String, String[]> fromStringToJsonObjectsWithoutExternalCurly =
                line -> line.trim()
                        .replaceFirst("^\\{", "")
                        .replaceFirst("}$", "")
                        .split("} *\\{");
        Function<String[], Stream<String>> arrToStream = Arrays::stream;

        Function<String,Stream<String>> line2jsonObjs = arrToStream.compose( fromStringToJsonObjectsWithoutExternalCurly );

        return in.flatMap( line2jsonObjs ).map( l -> "{" + l + "}" );
    }

    public static <T> Stream<List<T>> chunkedStream(Stream<T> stream, int size) {

        AtomicReference<List<T>> bufferRef = new AtomicReference<>( new ArrayList<>() );


        return Stream.concat( stream.sequential(), Stream.of( LAST_ELEMENT ))
                .map( el -> {
                    List<T> buffer = bufferRef.get();

                    if( el == LAST_ELEMENT ) {
                        return buffer;
                    }

                    buffer.add( (T) el );


                    if( buffer.size() == size ) {
                       bufferRef.set( new ArrayList<>() );
                       return buffer;
                    }
                    else {
                        return null;
                    }
                })
                .filter(Objects::nonNull);
    }

    private static final Object LAST_ELEMENT = new Object();



}
