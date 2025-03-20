# Verifica differenze tra PR e Parameter Store

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Utilizzo](#utilizzo)

## Descrizione
- **retrieve_remote_parameters.sh**: Scarica localmente i valori contenuti nei Parameter store "radd-experimentation-zip-{1,...5} e li salva all'interno dei file "radd-experimentation-zip-{1,...5}##A##.json"
- **check_pr_param_diff.js**: Evidenzia le differenze tra i valori della PR e quelli del Parameter Store. 

**Esempio di output di "check_pr_param_diff.js"**

```bash

Legenda:
PR = Valori presenti nella PR e assenti nel Paramenter store
ParamStore = Valori presenti nel Paramenter store e assenti nella PR

Nome ParamStore | PR | ParamStore 
------------------------------
radd-experimentation-zip-1##A## | X | 56021
radd-experimentation-zip-2##A## | 91013,74025 | X
radd-experimentation-zip-3##A## | X | X
radd-experimentation-zip-4##A## | X | X
radd-experimentation-zip-5##A## | X | X

Fine.

```
In questo caso possiamo affermare che:
- nella PR è stato eliminato il valore "56021", attualmente presente nel pameter store "radd-experimentation-zip-1"
- nella PR sono aggiunti i valori "91013","74025", attualmente non presenti nel parameter store "radd-experimentation-zip-2"

Nota: "X" indica l'assenza di elementi che apportano differenze.

## Utilizzo

```bash

# 1. Impostare il branch e il commit ID corretti
git checkout -b <branch PR> origin/<branch PR>
git checkout <commit ID>

# 2. Recupero dei valori nei parameter store
cd /path/to/pn-troubleshooting/check_diff_in_pr_params
./retrieve_remote_parameters.sh <aws-profile>

# 3. Confronto dei valori presenti nei parameter store con quelli delle PR
./check_pr_param_diff.js

```
