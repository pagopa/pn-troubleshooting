library(sparklyr)

local_spark <- function() {
  #spark_install(version = "3.3.3", hadoop_version = "3")
  
  conf <- spark_config()
  conf$spark.driver.memory <- "8G"
  conf$spark.driver.cores <- 1
  conf$spark.executor.memory <- "8G"
  conf$spark.executor.cores <- 1
  conf$spark.dynamicAllocation.enabled <- "false"
  
  spark_connect(master = "local", version = "3.3.3", hadoop_version = "3", config = conf)
}

prepare_json_strings_from_cdc <- function( sc, raw_files_table_name, json_strings_table_name, path ) {
  spark_read_text( 
    sc = sc, 
    name = raw_files_table_name, 
    path = path, 
    memory = FALSE,
    options = list(recursiveFileLookup = "true") 
  )
  
  sdf_sql(sc, paste0("
    create or replace temporary view ", json_strings_table_name," as 
    select 
      '{' || lines_without_curly.json_string_without_curly || '}' as json_string
    from (
      select 
        explode( 
          split( regexp_replace( regexp_replace( trim(line), '^\\\\{',''), '\\\\}$',''), '\\\\}[ \\n]*\\\\{') 
        )
         as json_string_without_curly
      from ", raw_files_table_name, "
    )
     as lines_without_curly
    "
  ))
}
