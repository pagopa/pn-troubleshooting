import csv
from jinja2 import Environment, FileSystemLoader

    
def fn_codici():
    with open('send-taxomony.csv', mode ='r') as csv_file:
        dictR = csv.DictReader(csv_file)
        enti = [row for row in dictR]
        return enti

def fn_extract_unique_subset(source, keys_to_extract):
    subset_data = [
        {key: row[key] for key in keys_to_extract if key in row} 
        for row in source
    ]
    return list({frozenset(item.items()): item for item in subset_data}.values())


#enti=fn_enti()
#ambiti=fn_ambiti()
codici=fn_codici()

## print(enti)
## print(ambiti)
#print(codici)
#keys_to_extract = ['codice_ente', 'ente']
#subset_data = [
#    {key: row[key] for key in keys_to_extract if key in row} 
#    for row in codici
#]
#unique_subset_data = list({frozenset(item.items()): item for item in subset_data}.values())
#enti=unique_subset_data
enti=fn_extract_unique_subset(codici, ['codice_ente', 'ente'])
#print(enti)

#keys_to_extract = ['codice_ente', 'codice_ambito', 'ambito']
#subset_data = [
#    {key: row[key] for key in keys_to_extract if key in row} 
#    for row in codici
#]
#unique_subset_data = list({frozenset(item.items()): item for item in subset_data}.values())
ambiti=fn_extract_unique_subset(codici, ['codice_ente', 'codice_ambito', 'ambito'])
#print(ambiti)
environment = Environment(loader=FileSystemLoader("templates/"))
template = environment.get_template("tassonomia-send.md.j2")
content = template.render(enti=enti, ambiti=ambiti, codici=codici)
print(content)