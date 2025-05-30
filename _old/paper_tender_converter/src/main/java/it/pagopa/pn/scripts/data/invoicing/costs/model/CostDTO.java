package it.pagopa.pn.scripts.data.invoicing.costs.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * CostDTO
 */

public class CostDTO   {

    @JsonProperty("price")
    private BigDecimal price;

    @JsonProperty("price50")
    private BigDecimal price50;

    @JsonProperty("price100")
    private BigDecimal price100;

    @JsonProperty("price250")
    private BigDecimal price250;

    @JsonProperty("price350")
    private BigDecimal price350;

    @JsonProperty("price1000")
    private BigDecimal price1000;

    @JsonProperty("price2000")
    private BigDecimal price2000;

    @JsonProperty("priceAdditional")
    private BigDecimal priceAdditional;

    @JsonProperty("productType")
    private ProductTypeEnumDto productType;

    @JsonProperty("cap")
    private List<String> cap = null;

    @JsonProperty("zone")
    private InternationalZoneEnum zone;


    @JsonIgnore
    private String driverCode;

    public CostDTO price(BigDecimal price) {
        this.price = price;
        return this;
    }

    /**
     * Get price
     * minimum: 0
     * maximum: 999999
     * @return price
     */
    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public CostDTO priceAdditional(BigDecimal priceAdditional) {
        this.priceAdditional = priceAdditional;
        return this;
    }

    /**
     * Get priceAdditional
     * minimum: 0
     * maximum: 999999
     * @return priceAdditional
     */
    public BigDecimal getPriceAdditional() {
        return priceAdditional;
    }

    public void setPriceAdditional(BigDecimal priceAdditional) {
        this.priceAdditional = priceAdditional;
    }

    public CostDTO productType(ProductTypeEnumDto productType) {
        this.productType = productType;
        return this;
    }

    /**
     * Get productType
     * @return productType
     */
    public ProductTypeEnumDto getProductType() {
        return productType;
    }

    public void setProductType(ProductTypeEnumDto productType) {
        this.productType = productType;
    }

    public CostDTO cap(List<String> cap) {
        this.cap = cap;
        return this;
    }

    public CostDTO addCapItem(String capItem) {
        if (this.cap == null) {
            this.cap = new ArrayList<String>();
        }
        this.cap.add(capItem);
        return this;
    }

    /**
     * Get cap
     * @return cap
     */

    public List<String> getCap() {
        return cap;
    }

    public void setCap(List<String> cap) {
        this.cap = cap;
    }

    public CostDTO zone(InternationalZoneEnum zone) {
        this.zone = zone;
        return this;
    }

    /**
     * Get zone
     * @return zone
     */
    public InternationalZoneEnum getZone() {
        return zone;
    }

    public void setZone(InternationalZoneEnum zone) {
        this.zone = zone;
    }

    public String getDriverCode() {
        return driverCode;
    }

    public void setDriverCode(String driverCode) {
        this.driverCode = driverCode;
    }

    public BigDecimal getPrice50() {
        return price50;
    }

    public void setPrice50(BigDecimal price50) {
        this.price50 = price50;
    }

    public BigDecimal getPrice100() {
        return price100;
    }

    public void setPrice100(BigDecimal price100) {
        this.price100 = price100;
    }

    public BigDecimal getPrice250() {
        return price250;
    }

    public void setPrice250(BigDecimal price250) {
        this.price250 = price250;
    }

    public BigDecimal getPrice350() {
        return price350;
    }

    public void setPrice350(BigDecimal price350) {
        this.price350 = price350;
    }

    public BigDecimal getPrice1000() {
        return price1000;
    }

    public void setPrice1000(BigDecimal price1000) {
        this.price1000 = price1000;
    }

    public BigDecimal getPrice2000() {
        return price2000;
    }

    public void setPrice2000(BigDecimal price2000) {
        this.price2000 = price2000;
    }
}
