package it.pagopa.pn.scripts.commands.utils;

import org.apache.commons.io.IOUtils;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Stream;

public class PathsUtils {


    public  static void cleanFolder( Path folder) throws IOException {
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

    public static Stream<String> readPath( Path p ) throws IOException {
        return Files.lines( p );
    }

    public static Stream<String> readClasspathResource( String resourceName ) throws IOException {

        ClassLoader contextClassLoader = Thread.currentThread().getContextClassLoader();

        try(InputStream in = contextClassLoader.getResourceAsStream( resourceName ) ) {

            StringWriter writer = new StringWriter();
            IOUtils.copy(in, writer, "UTF-8");
            String[] lines = writer.toString().split("\n");
            return Arrays.stream( lines );
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
