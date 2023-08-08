FROM rocker/rstudio


RUN apt-get update \
    && apt-get install -qy \
       openjdk-8-jdk

RUN Rscript -e 'install.packages("sparklyr")'
RUN Rscript -e 'install.packages("shiny")'


RUN Rscript -e 'library(sparklyr)' \
            -e 'spark_install(version = "3.3.2", hadoop_version = "3")'
