package it.pagopa.pn.scripts.data.invoicing.costs;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.*;
import java.util.stream.Collectors;
import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;


public class CostMapLoader {

    public static CostMap load(Path capPath, Path zonesPath ) throws IOException {
        
        Map<String, SortedSet<String>> zoneLines = loadZoneLines( zonesPath );
        SortedMap<String, String> stateToZone = stateToZone( zoneLines );
        List<PaperCostsOneProductType> costs = loadZipCodes( capPath );

        costs = explodeByForeignState( costs, zoneLines );

        return new CostMap( costs );
        
    }

    private static Map<String, SortedSet<String>> loadZoneLines( Path zonesPath ) throws IOException {
        Map<String, SortedSet<String>> zoneLines = Files.lines( zonesPath )
                .map( line -> line.replaceFirst(";.*;", ";").split(";") )
                .collect(Collectors.toMap(
                        (arr) -> arr[0],
                        (arr) -> new TreeSet<>( Collections.singleton( arr[1] )),
                        CostMapLoader::mergeSets
                ));
        return zoneLines;
    }

    private static SortedMap<String, String> stateToZone( Map<String, SortedSet<String>> zones) {
        SortedMap<String, String> statesMap = new TreeMap<>();

        for( Map.Entry<String, SortedSet<String>> entry: zones.entrySet() ) {
            String zone = entry.getKey().trim();
            for(String state: entry.getValue() ) {
                statesMap.put( state.trim(), zone );
            }
        }

        return statesMap;
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
                                           0, 7, 9, 10, 11, 13, 14, 15, 16, 17, 18 );
                    costs.add( rs );


                    PaperCostsOneProductType ar;
                    ar = buildOneCostFromCsvCells( values, "AR", 
                                          0, 24, 26, 27, 28, 30, 31, 32, 33, 34, 35 );
                    costs.add( ar );
                    

                    PaperCostsOneProductType _890;
                    _890 = buildOneCostFromCsvCells( values, "890", 
                                          0, 40, 42, 43, 44, 46, 47, 48, 49, 50, 51 );
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
        int consBaseIdx, int consFoglioIdx,
        int rec20idx, int rec50idx, int rec100idx, int rec250idx, 
        int rec350idx, int rec1000idx, int rec2000idx
    ) {
        String zipCodeOrForeignStateArea = values[ keyIdx ].trim();
                    
        String recapitista = values[ recapitistaIdx ].trim();
        Integer consolidatore_costoBase = csvCellToInteger( values[ consBaseIdx ] );
        Integer consolidatore_costoPerFoglioOltrePrimo = csvCellToInteger( values[ consFoglioIdx ] );

        Integer recapitista_max_20g = csvCellToInteger( values[ rec20idx ] );
        Integer recapitista_max_50g = csvCellToInteger( values[ rec50idx ] );
        Integer recapitista_max_100g = csvCellToInteger( values[ rec1000idx ] );
        Integer recapitista_max_250g = csvCellToInteger( values[ rec250idx ] );
        Integer recapitista_max_350g = csvCellToInteger( values[ rec350idx ] );
        Integer recapitista_max_1000g = csvCellToInteger( values[ rec1000idx ] );
        Integer recapitista_max_2000g = csvCellToInteger( values[ rec2000idx ] );
        
        PaperCostsOneProductType el = null;

        if( consolidatore_costoBase != null ) {
            el = new PaperCostsOneProductType(
                    zipCodeOrForeignStateArea,
                    productType,
                    recapitista, 
                    integerToLong( consolidatore_costoBase ),
                    integerToLong( consolidatore_costoPerFoglioOltrePrimo )
                )
                .addCost( 20, (long) recapitista_max_20g )
                .addCost( 50, (long) recapitista_max_50g )
                .addCost( 100, (long) recapitista_max_100g )
                .addCost( 250, (long) recapitista_max_250g )
                .addCost( 350, (long) recapitista_max_350g )
                .addCost( 1000, (long) recapitista_max_1000g )
                .addCost( 2000, (long) recapitista_max_2000g )
                ;
        
        }
        return el;
    }

    private static Integer csvCellToInteger( String cellValue ) {
      try {
        if( cellValue == null || cellValue.trim().isEmpty() || "ND".equalsIgnoreCase(cellValue.trim()) ) {
          return null;
        }
        else {
          return Integer.parseInt( cellValue.replaceAll("[^0-9]", ""));
        }
      }
      catch( NumberFormatException exc ) {
        System.out.println( cellValue + ") " + exc.getMessage() );
        throw new RuntimeException( exc );
      }
    } 

    private static Long integerToLong( Integer from ) {
      return ( from == null ) ? null : Long.valueOf( (long) from );
    }

    private static SortedSet<String> mergeSets(SortedSet<String> a, SortedSet<String> b ) {
        SortedSet<String> merged = new TreeSet<>(a);
        merged.addAll( b );
        return merged;
    }

    
    private static List<PaperCostsOneProductType> explodeByForeignState( 
        List<PaperCostsOneProductType> costs, 
        Map<String, SortedSet<String>> zoneStates 
    ) {
        List<PaperCostsOneProductType> explodedCosts = new ArrayList();
        
        for( PaperCostsOneProductType cost: costs ) {
            String geoKey = cost.getGeographicalKey();
            if( isForeignStateZone( geoKey )) {
              
              geoKey = translateForeignStateZone( geoKey );
              String product = translateForeignStateProduct( cost.getSvcType() );
              for( String state : zoneStates.get( geoKey )) {
                explodedCosts.add( cost.withGeoKeyAndProduct( state, product ) );
              }
            }
            else {
                explodedCosts.add( cost );
            }
        }

        return explodedCosts;
    }

    private static boolean isForeignStateZone( String geoKey ) {
      return geoKey.toUpperCase().startsWith("ZON");
    }

    private static String translateForeignStateZone( String googleDriveZone ) {
      String paperChannelCsvZone = googleDriveZone.replaceFirst("Zona ", "ZONE_");
      return paperChannelCsvZone;
    }

    private static String translateForeignStateProduct( String nationalProduct ) {
      String internationalProduct;
      
      if( "AR".equals( nationalProduct )) {
        internationalProduct = "RIR";
      }
      else if( "RS".equals( nationalProduct )) {
        internationalProduct = "RIS";
      }
      else {
        throw new RuntimeException("Unsupported inter-national extension for [" + nationalProduct + "]");
      }
      
      return internationalProduct;
    }


    public static final String BASE_PATH = "/Users/mvit/Documents/pn/pn-troubleshooting/timeline_for_invoicing__add_zipcode/input_data/";

    public static void main(String[] args) throws IOException {
        CostMap costMap = load(
                Path.of(BASE_PATH + "MatriceCAP-COSTI_v0_6.csv"),
                Path.of(BASE_PATH + "zones.csv")
        );

        System.out.println( costMap );
        System.out.println("Spagna RIS) " + costMap.get( null, "SPAGNA", "RIR") );
        System.out.println("Spagna AR) " + costMap.get( null, "SPAGNA", "AR") );
        System.out.println("Bologna 40129 890) " + costMap.get( "40129", "ITALIA", "890") );
        
        Files.writeString( 
            Path.of(BASE_PATH + "../out/costData.csv"), 
            costMap.toCsv(), 
            StandardOpenOption.CREATE
          );
    }
}
