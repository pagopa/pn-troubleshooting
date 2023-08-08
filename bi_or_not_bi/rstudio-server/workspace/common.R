library(sparklyr)

local_spark <- function() {
  spark_install(version = "3.3.2", hadoop_version = "3")
  spark_connect(master = "local", version = "3.3.2", hadoop_version = "3")
}

prepare_json_strings_from_cdc <- function( sc, raw_files_table_name, json_strings_table_name, path ) {
  spark_read_text( 
    sc = sc, 
    name = raw_files_table_name, 
    path = path, 
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
