FROM rocker/rstudio@sha256:85e84d206368208675350d8740725d8642662120cea847ccf41e24c6ad278459


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
