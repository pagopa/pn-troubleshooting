package it.pagopa.pn.scripts.data.invoicing.costs;

import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.SortedMap;


public class PaperCostsOneProductType {
    private String geographicalKey;
    private String svcType;
    private String recapitista;
    private long consolidatoreCostoBase;
    private long consolidatoreCostoFogliOltreIlPrimo;

    private SortedMap<Integer, Long> costoRecapitistaPerPeso = new TreeMap<>();

    public PaperCostsOneProductType(
      String geographicalKey,
      String svcType,
      String recapitista,
      long consolidatoreCostoBase,
      long consolidatoreCostoFogliOltreIlPrimo
    ) {
      this.geographicalKey = geographicalKey;
      this.svcType = svcType;
      this.recapitista = recapitista;
      this.consolidatoreCostoBase = consolidatoreCostoBase;
      this.consolidatoreCostoFogliOltreIlPrimo = consolidatoreCostoFogliOltreIlPrimo;
    }

    public String getGeographicalKey() {
        return geographicalKey;
    }

    public String getSvcType() {
        return svcType;
    }

    public void setSvcType(String svcType) {
        this.svcType = svcType;
    }

    public String getRecapitista() {
        return recapitista;
    }

    public void setRecapitista(String recapitista) {
        this.recapitista = recapitista;
    }

    public long getConsolidatoreCostoBase() {
        return consolidatoreCostoBase;
    }

    public void setConsolidatoreCostoBase(long consolidatoreCostoBase) {
        this.consolidatoreCostoBase = consolidatoreCostoBase;
    }

    public long getConsolidatoreCostoFogliOltreIlPrimo() {
        return consolidatoreCostoFogliOltreIlPrimo;
    }

    public void setConsolidatoreCostoFogliOltreIlPrimo(long consolidatoreCostoFogliOltreIlPrimo) {
        this.consolidatoreCostoFogliOltreIlPrimo = consolidatoreCostoFogliOltreIlPrimo;
    }

    public SortedMap<Integer, Long> getCostoRecapitistaPerPeso() {
        return costoRecapitistaPerPeso;
    }

    public void setCostoRecapitistaPerPeso(SortedMap<Integer, Long> costoRecapitistaPerPeso) {
        this.costoRecapitistaPerPeso = costoRecapitistaPerPeso;
    }

    public PaperCostsOneProductType addCost( Integer maxWeightGrams, Long costEuroCent ) {
      this.costoRecapitistaPerPeso.put( maxWeightGrams, costEuroCent );
      return this;
    }

    public PaperCostsOneProductType withGeoKeyAndProduct( String geoKey, String product ) {
      PaperCostsOneProductType result = new PaperCostsOneProductType( geoKey, product, 
                   recapitista, consolidatoreCostoBase,consolidatoreCostoFogliOltreIlPrimo);
      costoRecapitistaPerPeso.forEach( ( w, c ) -> result.addCost(w, c) );
      return result;
    }

    @Override
    public String toString() {
      return "Key[" + geographicalKey + " " + svcType + "]" 
             + " ConsCost(" +  consolidatoreCostoBase + " + <nFogli -1> x " + consolidatoreCostoFogliOltreIlPrimo
             + " RecCost(" + costoRecapitistaPerPeso.entrySet().stream()
                  .map( entry -> "<" + entry.getKey() + "g -> " + entry.getValue())
                  .collect(Collectors.joining(" ; "))
             + ")"
             + " Recap(" + recapitista + ")"; 
    }
}
