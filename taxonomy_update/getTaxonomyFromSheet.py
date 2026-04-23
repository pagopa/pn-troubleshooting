import requests

# URL of the published Google Sheets document in CSV format
google_sheet_url = 'https://docs.google.com/spreadsheets/d/1yhfQveEnAE6kZDkGFAGAABsItgCbYRs83ldCM7BwKRQ/export?format=csv&id=1yhfQveEnAE6kZDkGFAGAABsItgCbYRs83ldCM7BwKRQ&gid=1050035830'

# Send a request to download the sheet as a CSV
response = requests.get(google_sheet_url)

# Save the CSV content to a file
if response.status_code == 200:
    with open('send-taxomony.csv', 'wb') as file:
        file.write(response.content)
    print("CSV file saved as 'send-taxomony.csv'")
else:
    print("Failed to download CSV. Status code:", response.status_code)
