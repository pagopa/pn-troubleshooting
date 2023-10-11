# Aggiunta del C.A.P. e dello stato estero alla timeline per fatturazione

Per test locale:
 - rendere corrente la directory in cui è presente questo file.
 - copiare la cartella __input_data_example__ in __input_data__
 - eseguire lo script 
   ```./run.sh```

Per esecuzione su AWS:
- effettuare il deploy del template cloudformation `src/cfn/codebuild_task.yaml`
- eseguire il codebuild `ComputeTimelineForInvoicingWithZipCodeAndForeignState` 
  che viene creato durante il deploy
