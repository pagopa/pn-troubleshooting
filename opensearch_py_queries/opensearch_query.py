from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
import boto3
import os

openserch_host = os.environ['Openserch_host']
host = openserch_host 
region = 'eu-south-1'
service = 'es'
credentials = boto3.Session().get_credentials()
auth = AWSV4SignerAuth(credentials, region, service)

client = OpenSearch(
    hosts = [{'host': host, 'port': 443}],
    http_auth = auth,
    use_ssl = True,
    verify_certs = True,
    connection_class = RequestsHttpConnection,
    pool_maxsize = 20
)

query ={ 
    "query": {
        "dis_max": {
            "queries": [
                { "match_phrase": { "aud_type_msg": "AUD_ACC_LOGIN" }},
                { "match_phrase": { "msg": "success" }}
            ]
        }
    }
}


response = client.count(
    body = query,
    index="pn-logs10y*",
)

count = response["count"]
print("il numero totale di login da tutti i canali e': ",count)

send_total_login = {
    'MetricName': 'countlogin',
    'Dimensions': [
        {
            'Name': 'Region',
            'Value': 'eu-south-1'
        }
    ],
    'Value': int(count)
}

# Send Metric to Cloudwatch
cloudwatch_client = boto3.client('cloudwatch')
cloudwatch_client.put_metric_data(
    Namespace='OpensearchData',
    MetricData=[send_total_login]
)


query2 ={ 
  "query": {
    "bool": {
      "must": [
        {
          "match_all": {}
        }
      ],
      "filter": [
        {
          "match_phrase": {
            "aud_type": "AUD_NT_VIEW_RCP"
          }
        },
        {
          "match_phrase": {
            "message": "[AUD_NT_VIEW_RCP] SUCCESS - getReceivedNotification"
          }
        },
        {
          "match_phrase": {
            "uid_prefix": "IO-PF"
          }
        },      
        {
          "bool": {
            "must_not": [
              {
                "match": {
                  "cx-id": {
                    "query": ""
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}


response2 = client.count(
    body = query2,
    index="pn-logs10y*",
)

count = response2["count"]
print("il numero totale di NotificationViewed dal canale AppIO e': ",count)

send_total_viewAppIO = {
    'MetricName': 'countAppIoViewed',
    'Dimensions': [
        {
            'Name': 'Region',
            'Value': 'eu-south-1'
        }
    ],
    'Value': int(count)
}

# Send Metric to Cloudwatch
cloudwatch_client = boto3.client('cloudwatch')
cloudwatch_client.put_metric_data(
    Namespace='OpensearchData',
    MetricData=[send_total_viewAppIO]
)

query3 ={ 
  "query": {
    "bool": {
      "must": [
        {
          "match_all": {}
        }
      ],
      "filter": [
        {
          "match_phrase": {
            "aud_type": "AUD_NT_VIEW_RCP"
          }
        },
        {
          "match_phrase": {
            "message": "[AUD_NT_VIEW_RCP] SUCCESS - getReceivedNotification"
          }
        },
        {
          "bool": {
            "must_not": [
              {
                "match": {
                  "cx-id": {
                    "query": ""
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}

response3 = client.count(
    body = query3,
    index="pn-logs10y*",
)

count = response3["count"]
print("il numero totale di NotificationViewed da tutti i canali e': ",count)

send_total_view_All = {
    'MetricName': 'countallViewed',
    'Dimensions': [
        {
            'Name': 'Region',
            'Value': 'eu-south-1'
        }
    ],
    'Value': int(count)
}

# Send Metric to Cloudwatch
cloudwatch_client = boto3.client('cloudwatch')
cloudwatch_client.put_metric_data(
    Namespace='OpensearchData',
    MetricData=[send_total_view_All]
)
