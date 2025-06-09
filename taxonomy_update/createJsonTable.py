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


codici=fn_codici()

environment = Environment(loader=FileSystemLoader("templates/"))
template = environment.get_template("pn-TaxonomyCode.json.j2")
content = template.render(codici=codici)
print(content)