import os.path
import uuid
from typing import Optional, NoReturn, List

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
            mode: Optional[str] = 'overwrite',
            partition_by: Optional[str | List[str]] = None
    ) -> NoReturn:
        """

        :param df:                  Dataframe to write out
        :param output_name:         Destination file name
        :param output_folder:       Destination folder
        :param output_format:       Format of the destination file , default is 'parquet'
        :param mode:                Mode for writing operation, default is 'overwrite'
        :param partition_by:        The Column to partition by, default is None which means no partitioning
        """

        # Ensure unique file export
        unique_uuid: str = str(uuid.uuid4())

        output_path: str = os.path.join(output_folder, unique_uuid, output_name) + '.' + output_format
        dataframe_writer: DataFrameWriter = df.write.mode(saveMode=mode)

        if partition_by is not None:
            dataframe_writer.partitionBy(partition_by)

        if output_format == Format.CSV.value:
            CustomDataFrameWriter._write_csv(dataframe_writer=dataframe_writer, output_path=output_path)
        else:
            CustomDataFrameWriter._write_parquet(dataframe_writer=dataframe_writer, output_path=output_path)

    @staticmethod
    def _write_csv(dataframe_writer: DataFrameWriter, output_path: str) -> None:
        dataframe_writer.options(header='True', delimiter=';').csv(output_path)

    @staticmethod
    def _write_parquet(dataframe_writer: DataFrameWriter, output_path: str) -> None:
        dataframe_writer.parquet(output_path)
