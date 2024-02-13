import pathlib
import os.path

from configparser import ConfigParser

config_ini_path = pathlib.Path(__file__).parent.absolute() / 'config.ini'

if not os.path.exists(config_ini_path):
    raise FileNotFoundError('Could not find config.ini file. You have to create it locally before starting spark job')

config_parser = ConfigParser()
config_parser.read(config_ini_path)

"""
    Global variable and configuration definition,
    configure Spark environment to comply with your local machine requirements.
    
    Notes: config.ini file is in .gitignore so everyone have to create one with the configuration sections below
    see Readme.md for more information
"""
APP_CONFIG = {
    'spark': {
        'name': config_parser['spark']['name'],
        'master': config_parser['spark']['master'],
        'memory': config_parser['spark']['memory'],
        'driver.memory': config_parser['spark']['driver.memory'],
        'executor.memory': config_parser['spark']['executor.memory'],
        'executor.cores': config_parser['spark']['executor.cores'],
        'executor.instances': config_parser['spark']['executor.instances'],
        'dynamicAllocation.enabled': config_parser['spark']['dynamicAllocation.enabled'],
        'logLevel': config_parser['spark']['logLevel']
    },
    'input': {
        'path.metadataRequest': config_parser['input']['path.metadataRequest'],
        'path.analyzeFile': config_parser['input']['path.analyzeFile']
    },
    'output': {
        'path': config_parser['output']['path'],
        'format': config_parser['output']['format']
    }
}
