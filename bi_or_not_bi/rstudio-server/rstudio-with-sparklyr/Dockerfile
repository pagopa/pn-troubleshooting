FROM rocker/rstudio@sha256:1b336003a4103bc3271ba4bc3ff3b52f10846b5395cb8d567de49bc2d2035311


RUN apt-get update \
    && apt-get install -qy \
       openjdk-8-jdk

RUN Rscript -e 'install.packages("sparklyr")'
RUN Rscript -e 'install.packages("shiny")'

RUN mkdir /home/rstudio/spark/ \
    && cd /home/rstudio/spark/ \
    && wget https://dlcdn.apache.org/spark/spark-3.3.3/spark-3.3.3-bin-hadoop3.tgz \
    && tar xvzf spark-3.3.3-bin-hadoop3.tgz

RUN cd /home/rstudio/spark/ \
    && chown -R rstudio:rstudio .
