package it.pagopa.pn.scripts.data.invoicing.costs;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.*;
import java.util.stream.Collectors;


public class CostMapLoaderPaper {

    public static CostMap load(Path capPath ) throws IOException {

        List<PaperCostsOneProductType> costs = loadZipCodes( capPath );

        return new CostMap( costs );
        
    }



    private static List<PaperCostsOneProductType> loadZipCodes( Path capPath ) throws IOException {

        try (CSVReader csvReader = new CSVReader( Files.newBufferedReader( capPath));) {
            List<PaperCostsOneProductType> costs = new ArrayList();
            boolean isHeader = true;
            
            String[] values = null;
            while ((values = csvReader.readNext()) != null) {

                if( !isHeader ) {
                    PaperCostsOneProductType rs;
                    rs = buildOneCostFromCsvCells( values, "RS", 
                                           0, 6, 7, 8, 9, 10, 11, 12, 13, 14);
                    costs.add( rs );


                    PaperCostsOneProductType ar;
                    ar = buildOneCostFromCsvCells( values, "AR", 
                                          0, 18, 19, 20, 21, 22, 23, 24, 25, 26 );
                    costs.add( ar );
                    

                    PaperCostsOneProductType _890;
                    _890 = buildOneCostFromCsvCells( values, "890", 
                                          0, 29, 30, 31, 32, 33, 34, 35, 36, 37 );
                    if( _890 != null) {
                      costs.add( _890 );
                    }  
                }

                isHeader = false;
            }

            return costs;
        }
        catch( CsvValidationException exc ) {
          throw new IOException( "CSV validation", exc );
        }
    }

    private static PaperCostsOneProductType buildOneCostFromCsvCells( 
        String[] values, 
        String productType, int keyIdx, int recapitistaIdx,
        int consFoglioIdx,
        int rec20idx, int rec50idx, int rec100idx, int rec250idx, 
        int rec350idx, int rec1000idx, int rec2000idx
    ) {
        String zipCodeOrForeignStateArea = values[ keyIdx ].trim();
                    
        String recapitista = values[ recapitistaIdx ].trim();
        BigDecimal consolidatore_costoPerFoglioOltrePrimo = csvCellToBigDecimal( values[ consFoglioIdx ] );

        BigDecimal recapitista_max_20g = csvCellToBigDecimal( values[ rec20idx ] );
        BigDecimal recapitista_max_50g = csvCellToBigDecimal( values[ rec50idx ] );
        BigDecimal recapitista_max_100g = csvCellToBigDecimal( values[ rec100idx ] );
        BigDecimal recapitista_max_250g = csvCellToBigDecimal( values[ rec250idx ] );
        BigDecimal recapitista_max_350g = csvCellToBigDecimal( values[ rec350idx ] );
        BigDecimal recapitista_max_1000g = csvCellToBigDecimal( values[ rec1000idx ] );
        BigDecimal recapitista_max_2000g = csvCellToBigDecimal( values[ rec2000idx ] );
        
        PaperCostsOneProductType el = null;

        if( consolidatore_costoPerFoglioOltrePrimo != null ) {
            el = new PaperCostsOneProductType(
                    zipCodeOrForeignStateArea,
                    productType,
                    recapitista,
                    BigDecimal.ZERO ,
                    consolidatore_costoPerFoglioOltrePrimo
            )
                    .addCost( 20,  recapitista_max_20g )
                    .addCost( 50,  recapitista_max_50g )
                    .addCost( 100,  recapitista_max_100g )
                    .addCost( 250,  recapitista_max_250g )
                    .addCost( 350,  recapitista_max_350g )
                    .addCost( 1000, recapitista_max_1000g )
                    .addCost( 2000, recapitista_max_2000g )
                ;
        
        }
        return el;
    }

    private static BigDecimal csvCellToBigDecimal(String cellValue ) {
        try {
            if( cellValue == null || cellValue.trim().isEmpty() || "ND".equalsIgnoreCase(cellValue.trim())
                    || "#VALUE!".equalsIgnoreCase(cellValue.trim()) ) {
                return null;
            }
            else {
                return new BigDecimal( cellValue.replaceAll("[^0-9]", ""));
            }
        }
        catch( NumberFormatException exc ) {
            System.out.println( cellValue + ") " + exc.getMessage() );
            throw new RuntimeException( exc );
        }
    }



    private static SortedSet<String> mergeSets(SortedSet<String> a, SortedSet<String> b ) {
        SortedSet<String> merged = new TreeSet<>(a);
        merged.addAll( b );
        return merged;
    }




    public static final String BASE_PATH = CostMapLoaderPaper.class.getProtectionDomain().getCodeSource().getLocation().getPath();

    public static void main(String[] args) throws IOException, URISyntaxException {

        String input = "20240102 - Matrice CAP - COSTI_2023_gr_superiori.xlsx - DEF_Costi_SEND.csv";


        CostMap costMap = load(
                Paths.get(CostMapLoaderPaper.class.getClassLoader().getResource(input).toURI())
        );

        //System.out.println( costMap );
        //System.out.println("Spagna RIS) " + costMap.get( null, "SPAGNA", "RIR") );
        //System.out.println("Spagna AR) " + costMap.get( null, "SPAGNA", "AR") );
        //System.out.println("Bologna 40129 890) " + costMap.get( "40129", "ITALIA", "890") );
        
        Files.writeString( 
            Path.of(BASE_PATH + "../costData.csv"),
            costMap.toCsv(),
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING
          );

        Files.writeString(
                Path.of(BASE_PATH + "../tenderCurl.sh"),
                costMap.toCurl(),
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
        );





    }
}
