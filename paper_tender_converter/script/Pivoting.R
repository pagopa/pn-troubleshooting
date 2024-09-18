source( "common.R")

spark_disconnect_all()
Sys.setenv("SPARK_MEM" = "8g")

conf <- spark_config()
conf$spark.driver.memory <- "8G"
conf$spark.driver.cores <- 1
conf$spark.executor.memory <- "8G"
conf$spark.executor.cores <- 1
conf$spark.dynamicAllocation.enabled <- "false"

sc <- spark_connect(master = "local", version = "3.5.0", hadoop_version = "3", config = conf)


spark_read_csv(sc, 'matrice_costi_def', "data/20240911_DEF Costi SEND - correzione problema formula.xlsx - Matrice fatturazione.csv", delimiter = ',')

spark_read_csv(sc, 'zone', "data/20240625_zones.csv", delimiter = ';')

matrice_costi_pivot = 
sdf_collect( 
  sdf_sql(sc, "
  WITH 
    rowWithArray AS (
      SELECT 
        if(CAP not like 'ZONE%',  lpad(CAP, 5, '0'), CAP ) as CAP, 
        array(
          named_struct(
            'product', 'RS',
            'recapitista', RS_Recapitista,
            'lotto', RS_Lotto,
            'costo_plico', RS_Plico,
            'costo_foglio', RS_Foglio,
            'costo_demat', RS_dem,
            'costo_scaglioni', array(
              named_struct(
                'min', 1,
                'max', 20,
                'costo', RS_20,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 21,
                'max', 50,
                'costo', RS_21_50,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 51,
                'max', 100,
                'costo', RS_51_100,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 101,
                'max', 250,
                'costo', RS_101_250,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 251,
                'max', 350,
                'costo', RS_251_350,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 351,
                'max', 1000,
                'costo', RS_351_1000,
                'costo_base_20gr', RS_20
              ),
              named_struct(
                'min', 1001,
                'max', 2000,
                'costo', RS_1001_2000,
                'costo_base_20gr', RS_20
              )
            )
          ),
          named_struct(
            'product', 'AR',
            'recapitista', AR_Recapitista,
            'lotto', AR_Lotto,
            'costo_plico', AR_Plico,
            'costo_foglio', AR_Foglio,
            'costo_demat', AR_dem,
            'costo_scaglioni', array(
              named_struct(
                'min', 1,
                'max', 20,
                'costo', AR_20,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 21,
                'max', 50,
                'costo', AR_21_50,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 51,
                'max', 100,
                'costo', AR_51_100,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 101,
                'max', 250,
                'costo', AR_101_250,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 251,
                'max', 350,
                'costo', AR_251_350,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 351,
                'max', 1000,
                'costo', AR_351_1000,
                'costo_base_20gr', AR_20
              ),
              named_struct(
                'min', 1001,
                'max', 2000,
                'costo', AR_1001_2000,
                'costo_base_20gr', AR_20
              )
            )
          ),
          named_struct(
            'product', '890',
            'recapitista', 890_Recapitista,
            'lotto', 890_Lotto,
            'costo_plico', 890_Plico,
            'costo_foglio', 890_Foglio,
            'costo_demat', 890_dem,
             'costo_scaglioni', array(
              named_struct(
                'min', 1,
                'max', 20,
                'costo', 890_20,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 21,
                'max', 50,
                'costo', 890_21_50,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 51,
                'max', 100,
                'costo', 890_51_100,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 101,
                'max', 250,
                'costo', 890_101_250,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 251,
                'max', 350,
                'costo', 890_251_350,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 351,
                'max', 1000,
                'costo', 890_351_1000,
                'costo_base_20gr', 890_20
              ),
              named_struct(
                'min', 1001,
                'max', 2000,
                'costo', 890_1001_2000,
                'costo_base_20gr', 890_20
              )
            )
          )
        ) as products
      FROM matrice_costi_def
    ), 
      partialPivot AS (
        SELECT 
          CAP,
          product.*
        FROM 
          rowWithArray 
          lateral view explode (products) p as product
    ), completePivot AS (
      SELECT
        CAP,
        product,
        recapitista,
        lotto,
        costo_plico,
        costo_foglio,
        costo_demat,
        costoScaglioni.*
      FROM 
        partialPivot
        lateral view explode (costo_scaglioni) c as costoScaglioni
    ), geokeyPivot AS (
      SELECT 
        coalesce(z.countryIt, c.CAP) as geokey,
        CASE
          WHEN z.countryIt is not null AND product ='RS' THEN 'RIS'
          WHEN z.countryIt is not null AND product ='AR' THEN 'RIR'
          WHEN z.countryIt is not null AND product ='890' THEN 'delete'
          ELSE product
        END as product,
        recapitista,
        lotto,
        CAST(CAST(REPLACE(costo_plico, ',', '.') AS DECIMAL(10, 2)) * 100 as int) AS costo_plico,
        CAST(CAST(REPLACE(costo_foglio, ',', '.') AS DECIMAL(10, 2)) * 100 as int) AS costo_foglio,
        CAST(CAST(REPLACE(costo_demat, ',', '.') AS DECIMAL(10, 2)) * 100 as int) AS costo_demat,
        min,
        max,
        CAST(CAST(REPLACE(costo, ',', '.') AS DECIMAL(10, 2)) * 100 as int) AS costo,
        CAST(CAST(REPLACE(costo_base_20gr, ',', '.') AS DECIMAL(10, 2)) * 100 as int) AS costo_base_20gr,
        if( 
         c.CAP in ('14027', '21009'), '2024-09-30T22:00:00.000Z', '2024-07-31T22:00:00.000Z' 
        ) as startDate, 
        '2999-01-01T23:59:59.999Z' as endDate
      FROM
        completePivot c 
        LEFT JOIN zone z
        ON c.CAP = z.zone
    ) SELECT 
      *
      FROM geokeyPivot
      WHERE product != 'delete'
  ")
)

write.csv(matrice_costi_pivot, "data/out/matrice_costi_202408_pivot_v202410.csv", row.names=FALSE, na = "")

spark_read_csv(sc, 'matrice_costi_def_final_2023', "data/out/matrice_costi_2023_pivot.csv.gz")
spark_read_csv(sc, 'matrice_costi_def_final_202408', "data/out/matrice_costi_202408_pivot.csv.gz")


matrice_costi_pivot_test = 
  sdf_collect( 
    sdf_sql(sc, "
  SELECT *
  FROM matrice_costi_def_final_202408
  WHERE product = 'RIR'
  ") 
  )
