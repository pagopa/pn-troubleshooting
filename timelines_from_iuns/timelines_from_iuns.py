# read a list of IUNs from a TXT file and downloads the timelines from DynamoDB, writing to JSON.file
#
#
# aws sso login --profile sso_pn-core-prod
#
# source venv/bin/activate
# pip install -r requirements.txt
# python3 ./timelines_from_iuns.py iuns.txt timelines.json --profile sso_pn-core-prod

import sys
import datetime
import time
import json
from concurrent.futures import ThreadPoolExecutor

import boto3


if len(sys.argv) != 5 or sys.argv[3].strip() != '--profile':
    print('Usage: python3 ./timelines_from_iuns.py <source_filename> <destination_filename> --profile <profile_name>')
    sys.exit(1)

source_filename = sys.argv[1]
destination_filename = sys.argv[2]
profile_name = sys.argv[4]

timelines_table_name = 'pn-Timelines'

session = boto3.Session(profile_name=profile_name)
dynamodb = session.client('dynamodb')


def get_unique_iuns_from_source_filename(filename: str) -> list[str]:
    ids = set()
    try:
        with open(filename) as f:
            for line in f:
                ids.add(line.strip())
    except FileNotFoundError:
        print(f'File {filename} not found')
        sys.exit(1)

    return list(ids)


def get_timelines(iuns: list[str]) -> list:
    read_from_db = []
    
    def read_info_for_one_iun_from_db( iun_and_index: dict) -> dict:
        iun = iun_and_index['iun'].strip() # for removing spaces or newlines at ends
        idx = iun_and_index['idx']
        iuns_quantity = iun_and_index['tot']
        try:
            response = dynamodb.query(
                TableName=timelines_table_name,
                KeyConditionExpression='iun = :val',
                ExpressionAttributeValues={
                    ':val': {'S': iun}
                }
            )
        except:
            print(f'Problem querying DynamoDB table {timelines_table_name} for iun {iun}')
            sys.exit(1)

        items = response.get('Items', [])
        
        new_element = {
            "iun": None,
            "timeline": []
        }
        new_element["iun"] = iun

        if len(items) > 0:
            # for each item in the timeline, add it to the new_element["timeline"] array
            for item in items:
                timeline_element_id = item['timelineElementId']['S']
                category = item['category']['S']
                timestamp = item['timestamp']['S']
                notification_sent_at = item['notificationSentAt']['S']

                new_element["notificationSentAt"] = notification_sent_at # we could perform this assignment only once, but it's not a big deal

                new_element["timeline"].append({
                    "timelineElementId": timeline_element_id,
                    "category": category,
                    "timestamp": timestamp
                });
            
            # sort new_element["timeline"] by timestamp
            new_element["timeline"].sort(key=lambda x: x["timestamp"])
        
        if idx % 100 == 0:
            print(f'Analyzed {idx}/{iuns_quantity} timelines at {datetime.datetime.now()}')
        return new_element

    iuns_quantity = len( iuns )
    iuns_and_index = [{'iun':iun, 'idx':idx, 'tot': iuns_quantity} for idx,iun in enumerate(iuns)]
    with ThreadPoolExecutor(max_workers=10) as executor:
        read_from_db_gen = executor.map( read_info_for_one_iun_from_db, iuns_and_index )
    
    read_from_db = [ x for x in read_from_db_gen ]
    print(f'Analyzed {len(read_from_db)} timelines')

    return read_from_db



def write_to_file(processed: list, filename: str):
    try:
        with open(filename, 'w') as f:
            json.dump(processed, f, indent=4)
    except:
        print(f'Problem writing to {filename}')
        sys.exit(1)


if __name__ == '__main__':
    start = time.time()

    print(f'Processing {source_filename}...')
    iuns = get_unique_iuns_from_source_filename(source_filename)
    
    print(f'Decoded {len(iuns)} ids, querying DynamoDB for timelines...')
    processed = get_timelines(iuns)

    print(f'Processed {len(processed)} timelines, writing to {destination_filename}...')
    write_to_file(processed, destination_filename)

    end = time.time()
    print(f'Finished in {end - start} seconds')