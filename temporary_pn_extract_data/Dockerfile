# Usa l'immagine base di Ubuntu x86_64
FROM ubuntu:22.04

# Variabili di ambiente
ENV HIVE_VERSION=3.1.3
ENV HADOOP_VERSION=3.3.5
ENV JAVA_VERSION=11

# Imposta la variabile JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-arm64

# Aggiorna il sistema e installa dipendenze di base
RUN apt-get update && \
    apt-get install -y \
    wget \
    curl \
    telnet \
    openjdk-${JAVA_VERSION}-jdk \
    vim \
    gnupg \
    unzip

# Installa Hadoop
RUN wget https://downloads.apache.org/hadoop/common/hadoop-${HADOOP_VERSION}/hadoop-${HADOOP_VERSION}.tar.gz && \
    tar -xzf hadoop-${HADOOP_VERSION}.tar.gz -C /usr/local/ && \
    rm hadoop-${HADOOP_VERSION}.tar.gz && \
    mv /usr/local/hadoop-${HADOOP_VERSION} /usr/local/hadoop

# Installa Hive
RUN wget https://downloads.apache.org/hive/hive-${HIVE_VERSION}/apache-hive-${HIVE_VERSION}-bin.tar.gz && \
    tar -xzf apache-hive-${HIVE_VERSION}-bin.tar.gz -C /usr/local/ && \
    rm apache-hive-${HIVE_VERSION}-bin.tar.gz && \
    mv /usr/local/apache-hive-${HIVE_VERSION}-bin /usr/local/hive && \
    ln -s /usr/local/hive/bin/* /usr/local/bin/

# Configura variabili d'ambiente per Hive e Hadoop
ENV HIVE_HOME=/usr/local/hive
ENV HADOOP_HOME=/usr/local/hadoop
ENV PATH=$PATH:$HIVE_HOME/bin:$HADOOP_HOME/bin

# Imposta il comando per mantenere il contenitore in esecuzione
CMD ["tail", "-f", "/dev/null"]

