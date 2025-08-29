FROM rocker/rstudio@sha256:779353d18b7064ed8320f0e9d764ad69249bdcd40258e37b7d1db6e0ce082425


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
