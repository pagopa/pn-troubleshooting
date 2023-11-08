# read a list of IUNs from a TXT file and downloads the timelines from DynamoDB, writing to JSON.file

source IUNS file example:

    TUQU-NUKZ-XJAR-202310-U-1
    PLWA-ZMDA-MDJE-202310-X-1
    QJWD-NEJR-TJEX-202310-Y-1

AWS login:

    aws sso login --profile sso_pn-core-prod

Python dependencies:

    source venv/bin/activate
    pip install -r requirements.txt

launch:

    python3 ./timelines_from_iuns.py iuns.txt timelines.json --profile sso_pn-core-prod