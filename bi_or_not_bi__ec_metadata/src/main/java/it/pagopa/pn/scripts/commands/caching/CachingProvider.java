package it.pagopa.pn.scripts.commands.caching;

import it.pagopa.pn.scripts.commands.enumerations.CacheEnum;

public final class CachingProvider {

    private CachingProvider() {}

    public static CacheManager<?> create(CacheEnum cacheType) {

        if (cacheType.equals(CacheEnum.SPARK)) return new SparkCacheManager();
        throw new IllegalArgumentException("Unsupported cache type: " + cacheType);
    }
}
