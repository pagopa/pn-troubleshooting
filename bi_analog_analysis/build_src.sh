# Create virtual environment for pyspark job
python3.12 -m venv spark-venv

# Activate virtual environment
source spark-venv/bin/activate

# Install required packages
pip install -r requirements.txt