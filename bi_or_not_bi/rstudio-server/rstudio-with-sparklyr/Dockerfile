FROM rocker/rstudio@sha256:e20873e75a9dfe7808a9087c683f7f3f26c31bddb1f31a24ba2f674942df2750


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
