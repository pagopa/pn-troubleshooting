from typing import Optional, NoReturn

from pyspark.sql.dataframe import DataFrame
from pyspark.sql.readwriter import DataFrameWriter

from analog_analysis.src.utils.format import Format


def write(
        df: DataFrame,
        file_name: str,
        file_format: Optional[str] = Format.PARQUET.value,
        mode: Optional[str] = 'overwrite'
) -> NoReturn:
    """

    :param df:              Dataframe to write out
    :param file_name:       File name output
    :param file_format:     Format of the output file , default is 'parquet'
    :param mode:            Mode for writing operation, default is 'overwrite'
    """
    dataframe_writer: DataFrameWriter = df.write.mode(saveMode=mode)

    if file_format == Format.CSV.value:
        dataframe_writer.options(header='True', delimiter=';').csv(file_name + '.' + file_format)
    else:
        dataframe_writer.parquet(file_name + '.' + file_format)
