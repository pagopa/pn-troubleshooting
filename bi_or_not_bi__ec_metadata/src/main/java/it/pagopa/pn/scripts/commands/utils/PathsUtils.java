package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.exceptions.FileNotFoundException;
import org.apache.commons.io.IOUtils;
import org.apache.commons.io.file.PathUtils;

import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.stream.Stream;

public class PathsUtils {

    private PathsUtils() {}

    public static void cleanFolder( Path folder) throws IOException {
        if( Files.exists( folder )) {
            Files.walk( folder )
                    .sorted(Comparator.reverseOrder())
                    .filter( f -> ! folder.equals( f ))
                    .map(Path::toFile)
                    .forEach(File::delete);
        }
        else {
            Files.createDirectories( folder );
        }
    }

    public static String readPath( Path p ) throws IOException {
        return Files.readString( p );
    }

    public static Stream<String> readPathAsStream( Path p ) throws IOException {
        return Files.lines( p );
    }

    public static String readClasspathResource( String resourceName ) throws IOException {
        ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();
        try(InputStream in = contextClassLoader.getResourceAsStream( resourceName ) ) {
            if (in == null) throw new FileNotFoundException(resourceName);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public static Stream<String> readClasspathResourceAsStream( String resourceName ) throws IOException {

        ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();

        try(InputStream in = contextClassLoader.getResourceAsStream( resourceName ) ) {

            if (in == null) throw new FileNotFoundException(resourceName);

            StringWriter writer = new StringWriter();
            IOUtils.copy(in, writer, StandardCharsets.UTF_8);
            String[] lines = writer.toString().split("\n");
            return Arrays.stream(lines);
        }
    }

    public static String datePathFromNow() {
        return datePathFromInstant(Instant.now());
    }

    public static String datePathFromInstant(Instant instant) {
        DateHoursStream.DateHour dateHour = DateHoursStream.DateHour.valueOf(instant);

        return concatPaths(
            String.valueOf(dateHour.getYear()),
            String.valueOf(dateHour.getMonth()),
            String.valueOf(dateHour.getDay())
        );
    }

    public static String concatPathsWithURISchema(String schema, String first, String... more) {
        return schema.concat(concatPaths(first, more));
    }

    public static String concatPaths(String first, String... more) {
        return Paths.get(first, more).toString();
    }

    public static String filenameWithExtensions(String filename, String extension) {
        String dotExtensions = extension.startsWith(".") ? extension : ".".concat(extension);
        return filename.concat(dotExtensions);
    }
}
