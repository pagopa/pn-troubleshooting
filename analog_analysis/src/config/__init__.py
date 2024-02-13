"""
    Global variable and configuration definition,
    configure Spark environment to comply with your local machine requirements
"""
APP_CONFIG = {
    'spark.name': 'all_analog_progress',
    'spark.master': 'local',
    'spark.memory': '24g',
    'spark.driver.memory': '4g',
    'spark.executor.memory': '5g',
    'spark.executor.cores': '3',
    'spark.executor.instances': '4',
    'spark.dynamicAllocation.enabled': 'false',
    'spark.logLevel': 'WARN',
    'input.path.metadata-request': 'resources/input/indexed/pn-EcRichiesteMetadati',
    'input.path.analyzeFile': 'resources/input/all_analog_progress_2023_gt10_202402131514.csv',
    'output.path': 'resources/output/',
    'output.format': 'parquet'
}
