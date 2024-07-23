package it.pagopa.pn.scripts.commands.caching;

public interface CacheManager<T> {

    T get(String key);

    void put(String key, T value);
    void remove(String key);
    void removeAll();
}
