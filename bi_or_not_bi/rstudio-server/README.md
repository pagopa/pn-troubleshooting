Per scaricare o aggioranre i dati da analizzare eseguire il comando
```
bi_or_not_bi/rstudio-server/workspace/update_data.sh
```


Per avviare il tool che fa finta di essere uno strumento di analisi dati 
eseguire, dalla cartella `bi_or_not_bi/rstudio-server`, i comandi

```
docker compose build 
docker compose up
```

Successivamente utilizzare un borwser per collegarsi all'URL http://localhost:8787/

Il nome utente è fisso "rstudio" la password viene generata e scritta all'avvio
del container.

Se si vuole avere una password costante bisogna configurarla 
scrivendo la riga 
```
YOUR_PASSWORD_FROM_ENV_FILE=attenti_agli_escape
```
nel file `bi_or_not_bi/rstudio-server/.env`

