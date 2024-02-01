library(sparklyr)

spark_install(version = "3.5.0", hadoop_version = "3")


spark_disconnect_all()

conf <- spark_config()
conf$spark.driver.memory <- "8G"
conf$spark.driver.cores <- 1
conf$spark.executor.memory <- "8G"
conf$spark.executor.cores <- 1
conf$spark.dynamicAllocation.enabled <- "false"

sc <- spark_connect(master = "local", version = "3.5.0", hadoop_version = "3", config = conf)

spark_read_csv(sc, name = "elenco_timeline_senza_cap", path = "data/fix_timeline/elenco_timeline_senza_cap.csv")
spark_read_json(sc, name = "cap_stati_esteri_avvisi_cartacei_precedenti_20230920", path = "data/fix_timeline/cap_stati_esteri_avvisi_cartacei_precedenti_20230920__json_obj_per_line.json")

sdf_sql(sc, " 
  create or replace temporary view merged as (
    SELECT
      t.*,
      c.Item.physicalAddress.M.cap.S as cap,
      c.Item.physicalAddress.M.state.S as stato_estero
    FROM 
      elenco_timeline_senza_cap t
      JOIN cap_stati_esteri_avvisi_cartacei_precedenti_20230920 c ON c.Item.sortKey.S = t.event_id
  )
")


csv_to_save = sdf_collect(sdf_sql(sc, "select * from merged "));
write.csv(csv_to_save, "data/the_674.csv", row.names=FALSE)

