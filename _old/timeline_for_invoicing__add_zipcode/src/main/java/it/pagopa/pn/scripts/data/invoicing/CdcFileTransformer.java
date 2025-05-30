package it.pagopa.pn.scripts.data.invoicing;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Function;

public class CdcFileTransformer {

    private LoadAndSaveCdcFile ioUtil = new LoadAndSaveCdcFile();

    public void transform( Path fromDir, Path toDir, Function<CdcFileParsedData, CdcFileParsedData> fileContentMapper ) throws IOException {
        AtomicInteger count = new AtomicInteger( 0 );
        
        Files.walk( fromDir )
                .filter( this::isFile )
                .forEach((Path cdcFile) -> {
                        System.out.println( count.getAndIncrement() + ") Transform " + cdcFile);
                        try {
                            CdcFileParsedData data = ioUtil.loadFileOfObjects(cdcFile);

                            CdcFileParsedData newData = fileContentMapper.apply( data );

                            this.saveTransformedData( fromDir, toDir, cdcFile, newData);

                        } catch (IOException exc) {
                            throw new RuntimeException(exc);
                        }
                });
    }

    public void walkSource( Path fromDir, Consumer<CdcFileParsedData> consumer ) throws IOException {
        AtomicInteger count = new AtomicInteger( 0 );
        
        Files.walk( fromDir )
                .filter( this::isFile )
                .forEach((Path cdcFile) -> {
                    System.out.println(count.getAndIncrement() + ") Walk " + cdcFile);
                    try {
                        CdcFileParsedData data = ioUtil.loadFileOfObjects(cdcFile);

                        consumer.accept( data );

                    } catch (IOException exc) {
                        throw new RuntimeException(exc);
                    }
                });
    }


    private boolean isFile( Path path ) {
        return !Files.isDirectory( path ) && !path.endsWith(".DS_Store");
    }

    protected void saveTransformedData( Path fromDir, Path toDir, Path readedPath, CdcFileParsedData newData) throws IOException {

        Path relativeFromSourceDir = fromDir.toAbsolutePath().relativize( readedPath.toAbsolutePath() );
        Path destinationPath = toDir.resolve( relativeFromSourceDir );

        ioUtil.saveFileOfObjects( destinationPath, newData );
    }

}
