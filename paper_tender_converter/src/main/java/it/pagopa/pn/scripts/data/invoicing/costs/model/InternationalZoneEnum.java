package it.pagopa.pn.scripts.data.invoicing.costs.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Gets or Sets InternationalZoneEnum
 */

public enum InternationalZoneEnum {

    _1("ZONE_1"),

    _2("ZONE_2"),

    _3("ZONE_3");

    private String value;

    InternationalZoneEnum(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @Override
    public String toString() {
        return String.valueOf(value);
    }

    @JsonCreator
    public static InternationalZoneEnum fromValue(String value) {
        for (InternationalZoneEnum b : InternationalZoneEnum.values()) {
            if (b.value.equals(value)) {
                return b;
            }
        }
        throw new IllegalArgumentException("Unexpected value '" + value + "'");
    }
}

