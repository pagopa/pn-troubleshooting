import csv

# Step 1: Read the CSV file
input_file = 'send-taxomony.csv'  # Your input file
output_file = 'sorted_send-taxomony.csv'  # The file where the sorted data will be saved

# Read data from CSV file
with open(input_file, mode='r', newline='', encoding='utf-8') as file:
    reader = csv.reader(file)
    header = next(reader)  # Extract the header (if present)
    rows = list(reader)  # Read the rest of the rows into a list

# Step 2: Determine the column index for the sorting criteria
column_name = 'codice_ente'  # Change this to the name of the column you want to sort by
if column_name not in header:
    raise ValueError(f"Column '{column_name}' not found in header.")

codice_ente_index = header.index(column_name)

column_name = 'codice_ambito'  # Change this to the name of the column you want to sort by
if column_name not in header:
    raise ValueError(f"Column '{column_name}' not found in header.")

codice_ambito_index = header.index(column_name)

column_name = 'codice_tipologia_atto'  # Change this to the name of the column you want to sort by
if column_name not in header:
    raise ValueError(f"Column '{column_name}' not found in header.")

# Get the index of the column to sort by
codice_tipologia_atto_index = header.index(column_name)

# Step 2: Sort the data by a specific column (for example, column 1, which is index 0)
# Change the key to the column index you want to sort by.
# For example, sorting by the second column (index 1):
sorted_rows = sorted(rows, key=lambda row: (row[codice_ente_index],row[codice_ambito_index],row[codice_tipologia_atto_index]))

# Step 3: Write the sorted data back to a new CSV file
with open(output_file, mode='w', newline='', encoding='utf-8') as file:
    writer = csv.writer(file)
    writer.writerow(header)  # Write the header
    writer.writerows(sorted_rows)  # Write the sorted rows

print(f"CSV file sorted and saved as {output_file}")