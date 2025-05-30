package it.pagopa.pn.scripts.commands.caching;

import it.pagopa.pn.scripts.commands.enumerations.CacheEnum;

/**
 * Provider for {@link CacheManager} classes
 * */
public final class CachingProvider {

    private CachingProvider() {}

    /**
     * Provides a {@link CacheManager} instance based on cacheType parameter
     *
     * @param cacheType type of cache to provide
     *
     * @return a {@link CacheManager} instance
     * */
    public static CacheManager<?> create(CacheEnum cacheType) {

        if (cacheType.equals(CacheEnum.SPARK)) return new SparkCacheManager();
        throw new IllegalArgumentException("Unsupported cache type: " + cacheType);
    }
}
