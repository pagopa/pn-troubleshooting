FROM rocker/rstudio@sha256:050e232046d8a8681d84444498a48afadfa7900fa783be5ec3ed9f4eb9f3ceb0


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
