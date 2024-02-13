import os.path
import uuid

from typing import Optional, NoReturn

from pyspark.sql.dataframe import DataFrame
from pyspark.sql.readwriter import DataFrameWriter

from bi_analog_analysis.src.utils.format import Format


class CustomDataFrameWriter:

    @staticmethod
    def write(
            df: DataFrame,
            output_name: str,
            output_folder: str,
            output_format: Optional[str] = Format.PARQUET.value,
            mode: Optional[str] = 'overwrite'
    ) -> NoReturn:
        """

        :param df:                  Dataframe to write out
        :param output_name:         Destination file name
        :param output_folder:       Destination folder
        :param output_format:       Format of the destination file , default is 'parquet'
        :param mode:                Mode for writing operation, default is 'overwrite'
        """

        # Ensure unique file export
        unique_uuid: str = str(uuid.uuid4())

        output_path: str = os.path.join(output_folder, unique_uuid, output_name) + '.' + output_format
        dataframe_writer: DataFrameWriter = df.write.mode(saveMode=mode)

        if output_format == Format.CSV.value:
            dataframe_writer.options(header='True', delimiter=';').csv(output_path)
        else:
            dataframe_writer.parquet(output_path)
