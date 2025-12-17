#!/usr/bin/env python3
"""
Script per eseguire query su Athena per trovare PREPARE_ANALOG_DOMICILE
nell'intervallo temporale [-24 ore, -1 ora] rispetto all'orario corrente.
Con supporto per esecuzione incrementale e timeout per Lambda.
"""

import argparse
import boto3
import time
import json
import os
import signal
from datetime import datetime, timedelta
from pathlib import Path
import sys

# Timeout globale per Lambda (14 minuti)
TIMEOUT_SECONDS = 14 * 60
timeout_reached = False

def timeout_handler(signum, frame):
    """Handler per il timeout dell'esecuzione."""
    global timeout_reached
    timeout_reached = True
    print("\nTIMEOUT: Raggiunto il limite di tempo. Salvataggio progressi...")
    raise TimeoutError("Execution timeout reached")


def read_json_from_s3(s3_path, profile_name=None):
    """
    Legge un file JSON da S3.
    
    Args:
        s3_path: Percorso S3 completo (es: s3://bucket/path/file.json)
        profile_name: Il profilo AWS da utilizzare (opzionale)
    
    Returns:
        dict: Contenuto del file JSON o None se non esiste
    """
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        s3_client = session.client('s3')
    else:
        s3_client = boto3.client('s3')
    
    # Parse S3 path
    s3_path = s3_path.replace('s3://', '')
    parts = s3_path.split('/', 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else ''
    
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        return json.loads(content)
    except s3_client.exceptions.NoSuchKey:
        return None
    except Exception as e:
        print(f"Errore nella lettura da S3 {s3_path}: {e}")
        return None


def write_json_to_s3(data, s3_path, profile_name=None):
    """
    Scrive un file JSON su S3.
    
    Args:
        data: Dizionario da salvare come JSON
        s3_path: Percorso S3 completo (es: s3://bucket/path/file.json)
        profile_name: Il profilo AWS da utilizzare (opzionale)
    
    Returns:
        bool: True se successo, False altrimenti
    """
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        s3_client = session.client('s3')
    else:
        s3_client = boto3.client('s3')
    
    # Parse S3 path
    s3_path = s3_path.replace('s3://', '')
    parts = s3_path.split('/', 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else ''
    
    try:
        json_content = json.dumps(data, indent=2, ensure_ascii=False)
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json_content.encode('utf-8'),
            ContentType='application/json'
        )
        return True
    except Exception as e:
        print(f"Errore nella scrittura su S3 {s3_path}: {e}")
        return False


def get_workgroup_output_location(workgroup_name, profile_name=None):
    """
    Recupera l'output location dal workgroup Athena.
    
    Args:
        workgroup_name: Nome del workgroup
        profile_name: Il profilo AWS da utilizzare (opzionale)
    
    Returns:
        output_location: Il percorso S3 configurato nel workgroup
    """
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        athena_client = session.client('athena')
    else:
        athena_client = boto3.client('athena')
    
    try:
        response = athena_client.get_work_group(WorkGroup=workgroup_name)
        output_location = response['WorkGroup']['Configuration']['ResultConfiguration']['OutputLocation']
        return output_location
    except Exception as e:
        print(f"Errore nel recupero dell'output location dal workgroup: {e}")
        return None


def execute_athena_query(query, database, output_location, profile_name=None, workgroup='primary'):
    """
    Esegue una query su Athena e attende i risultati.
    
    Args:
        query: La query SQL da eseguire
        database: Il database Athena da utilizzare
        output_location: Il percorso S3 per i risultati (opzionale se il workgroup ha una configurazione)
        profile_name: Il profilo AWS da utilizzare (opzionale)
        workgroup: Il workgroup Athena da utilizzare (default: 'primary')
    
    Returns:
        query_execution_id: L'ID dell'esecuzione della query
    """
    # Crea la sessione con il profilo specificato
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        athena_client = session.client('athena')
    else:
        athena_client = boto3.client('athena')
    
    # Prepara i parametri per la query
    query_params = {
        'QueryString': query,
        'QueryExecutionContext': {'Database': database},
        'WorkGroup': workgroup
    }
    
    # Aggiunge l'output location solo se specificato
    if output_location:
        query_params['ResultConfiguration'] = {'OutputLocation': output_location}
    
    # Esegue la query
    response = athena_client.start_query_execution(**query_params)
    
    query_execution_id = response['QueryExecutionId']
    print(f"Query execution ID: {query_execution_id}")
    
    # Attende il completamento della query
    while True:
        query_status = athena_client.get_query_execution(
            QueryExecutionId=query_execution_id
        )
        status = query_status['QueryExecution']['Status']['State']
        
        if status in ['SUCCEEDED', 'FAILED', 'CANCELLED']:
            break
        
        print(f"Query status: {status}. Waiting...")
        time.sleep(2)
    
    if status == 'SUCCEEDED':
        print(f"Query completed successfully!")
    else:
        error_message = query_status['QueryExecution']['Status'].get('StateChangeReason', 'Unknown error')
        print(f"Query {status}: {error_message}")
        sys.exit(1)
    
    return query_execution_id


def get_query_results(query_execution_id, profile_name=None):
    """
    Recupera i risultati della query Athena.
    
    Args:
        query_execution_id: L'ID dell'esecuzione della query
        profile_name: Il profilo AWS da utilizzare (opzionale)
    
    Returns:
        results: Lista dei risultati
    """
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        athena_client = session.client('athena')
    else:
        athena_client = boto3.client('athena')
    
    results = []
    next_token = None
    
    while True:
        if next_token:
            response = athena_client.get_query_results(
                QueryExecutionId=query_execution_id,
                NextToken=next_token
            )
        else:
            response = athena_client.get_query_results(
                QueryExecutionId=query_execution_id
            )
        
        results.extend(response['ResultSet']['Rows'])
        
        if 'NextToken' in response:
            next_token = response['NextToken']
        else:
            break
    
    return results


def format_results(results):
    """
    Formatta i risultati per la visualizzazione.
    
    Args:
        results: Lista dei risultati da Athena
    
    Returns:
        data_list: Lista di dizionari con i risultati
    """
    if not results:
        print("Nessun risultato trovato.")
        return []
    
    # Prima riga contiene gli header
    headers = [col['VarCharValue'] for col in results[0]['Data']]
    print(f"\nTrovati {len(results) - 1} risultati:")
    print("-" * 100)
    print(" | ".join(headers))
    print("-" * 100)
    
    # Converte i risultati in una lista di dizionari
    data_list = []
    
    # Stampa i risultati
    for row in results[1:]:
        values = [col.get('VarCharValue', '') for col in row['Data']]
        print(" | ".join(values))
        
        # Crea un dizionario per ogni riga
        row_dict = {}
        for i, header in enumerate(headers):
            row_dict[header] = values[i] if i < len(values) else ''
        data_list.append(row_dict)
    
    return data_list


def check_dynamodb_paper_request_error(timeline_element_ids, profile_name=None):
    """
    Verifica se i timelineElementId sono presenti in DynamoDB pn-PaperRequestError.
    
    Args:
        timeline_element_ids: Lista di timelineElementId da verificare
        profile_name: Il profilo AWS da utilizzare (opzionale)
    
    Returns:
        Restituisce gli elementi presenti e non presenti nella pn-PaperRequestError 
    """
    if not timeline_element_ids:
        return {}
    
    # Crea la sessione con il profilo specificato
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        dynamodb = session.client('dynamodb')
    else:
        dynamodb = boto3.client('dynamodb')
    
    result_map = {}
    table_name = 'pn-PaperRequestError'
    
    # Query per ogni timeline_element_id individualmente
    for idx, timeline_id in enumerate(timeline_element_ids):
        try:
            # Cerca esattamente il requestId usando query (funziona solo con partition key)
            response = dynamodb.query(
                TableName=table_name,
                KeyConditionExpression='requestId = :rid',
                ExpressionAttributeValues={
                    ':rid': {'S': timeline_id}
                },
                Limit=1,
                Select='COUNT'
            )
            
            # Se Count > 0, il record esiste
            result_map[timeline_id] = response.get('Count', 0) > 0
            
            # Mostra progresso ogni 100 verifiche con esempio di query
            if (idx + 1) % 100 == 0:
                print(f"  Verificati {idx + 1}/{len(timeline_element_ids)} su DynamoDB...")
                print(f"  Esempio query DynamoDB: requestId = '{timeline_id}'")
                
        except Exception as e:
            # In caso di errore, marca come false
            result_map[timeline_id] = False
    
    return result_map


def download_followup_events(start_time, end_time, database, output_location, profile_name=None, workgroup='primary', table='pn_timelines_json_view'):
    """
    Scarica tutti gli eventi SEND_ANALOG_DOMICILE e COMPLETELY_UNREACHABLE
    nell'intervallo temporale specificato.
    
    Args:
        start_time: Tempo di inizio assoluto
        end_time: Tempo di fine assoluto
        database: Il database Athena da utilizzare
        output_location: Il percorso S3 per i risultati
        profile_name: Il profilo AWS da utilizzare (opzionale)
        workgroup: Il workgroup Athena da utilizzare
        table: La tabella Athena da interrogare
    
    Returns:
        dict: Dizionario {iun: (has_result, result_type)}
    """
    # Crea la sessione con il profilo specificato
    if profile_name:
        session = boto3.Session(profile_name=profile_name)
        athena_client = session.client('athena')
    else:
        athena_client = boto3.client('athena')
    
    # Formatta per la query ISO 8601
    start_time_iso = start_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    end_time_iso = end_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    
    # Calcola le partizioni da includere (tutti i giorni dall'inizio alla fine)
    partition_filter = []
    current_date = start_time.date()
    end_date = end_time.date()
    while current_date <= end_date:
        year = current_date.strftime('%Y')
        month = current_date.strftime('%m')
        day = current_date.strftime('%d')
        partition_filter.append(f"(p_year = '{year}' AND p_month = '{month}' AND p_day = '{day}')")
        current_date += timedelta(days=1)
    
    partition_condition = " OR ".join(partition_filter)
    
    # Query per scaricare tutti gli eventi SEND e COMPLETELY_UNREACHABLE
    query = f"""
    SELECT iun, category
    FROM {table}
    WHERE category IN ('SEND_ANALOG_DOMICILE', 'COMPLETELY_UNREACHABLE')
        AND ({partition_condition})
        AND timestamp >= '{start_time_iso}'
        AND timestamp < '{end_time_iso}'
    """
    
    print(f"\nEsecuzione query per scaricare tutti gli eventi SEND/COMPLETELY_UNREACHABLE...")
    print(f"Intervallo: [{start_time.strftime('%Y-%m-%d %H:%M:%S')}, {end_time.strftime('%Y-%m-%d %H:%M:%S')}]")
    print(f"\nQuery SEND/COMPLETELY_UNREACHABLE:\n{query}\n")
    
    try:
        # Prepara i parametri per la query
        query_params = {
            'QueryString': query,
            'QueryExecutionContext': {'Database': database},
            'WorkGroup': workgroup
        }
        
        if output_location:
            query_params['ResultConfiguration'] = {'OutputLocation': output_location}
        
        # Esegue la query
        response = athena_client.start_query_execution(**query_params)
        query_execution_id = response['QueryExecutionId']
        
        # Attende il completamento
        while True:
            query_status = athena_client.get_query_execution(
                QueryExecutionId=query_execution_id
            )
            status = query_status['QueryExecution']['Status']['State']
            
            if status == 'SUCCEEDED':
                break
            elif status in ['FAILED', 'CANCELLED']:
                error_message = query_status['QueryExecution']['Status'].get('StateChangeReason', 'Unknown error')
                print(f"Query fallita: {error_message}")
                return {}
            
            time.sleep(2)
        
        print("Query completata, recupero risultati...")
        
        # Recupera i risultati con paginazione
        result_map = {}
        next_token = None
        
        while True:
            if next_token:
                response = athena_client.get_query_results(
                    QueryExecutionId=query_execution_id,
                    NextToken=next_token
                )
            else:
                response = athena_client.get_query_results(
                    QueryExecutionId=query_execution_id
                )
            
            rows = response['ResultSet']['Rows']
            
            # Salta l'header solo nella prima iterazione
            start_index = 1 if next_token is None else 0
            
            for row in rows[start_index:]:
                iun = row['Data'][0].get('VarCharValue', '')
                category = row['Data'][1].get('VarCharValue', '')
                
                # Prende solo il primo risultato per ogni IUN
                if iun and iun not in result_map:
                    result_map[iun] = (True, category)
            
            if 'NextToken' in response:
                next_token = response['NextToken']
            else:
                break
        
        print(f"Scaricati {len(result_map)} IUN con eventi SEND/COMPLETELY_UNREACHABLE")
        return result_map
        
    except Exception as e:
        print(f"Errore durante il download degli eventi follow-up: {e}")
        return {}


def save_results_to_json(data_list, output_dir, database, output_location, followup_start_time, followup_end_time, full_analysis=False, profile_name=None, workgroup='primary', prepare_end_time=None, s3_bucket=None, table='pn_timelines_json_view'):
    """
    Salva i risultati in un file JSON nella directory specificata o su S3.
    Filtra solo i campi: timestamp, iun, timelineElementId
    Verifica la presenza di eventi follow-up per ogni IUN.
    Gestisce l'aggiornamento incrementale: riverifica i casi esistenti e aggiunge i nuovi.
    
    Args:
        data_list: Lista di dizionari con i risultati
        output_dir: Directory dove salvare il file JSON (usato solo se s3_bucket è None)
        database: Il database Athena da utilizzare
        output_location: Il percorso S3 per i risultati Athena
        followup_start_time: Tempo di inizio per la ricerca eventi follow-up
        followup_end_time: Tempo di fine per la ricerca eventi follow-up
        full_analysis: Se True, stampa tutti i risultati invece di filtrare solo hasResult=false e isInPaperRequestError=false
        profile_name: Il profilo AWS da utilizzare (opzionale)
        workgroup: Il workgroup Athena da utilizzare
        prepare_end_time: End time della query PREPARE (usato per statistics last_update)
        s3_bucket: Bucket S3 dove salvare i file (es: s3://bucket/path/). Se None, salva in locale
    
    Returns:
        output_file: Percorso del file salvato (locale o S3)
    """
    # Determina se usare S3 o locale
    use_s3 = s3_bucket is not None
    
    if use_s3:
        # Rimuovi trailing slash se presente
        s3_bucket = s3_bucket.rstrip('/')
        output_file = f"{s3_bucket}/prepare_analog_domicile_latest.json"
        stats_file = f"{s3_bucket}/statistics.json"
    else:
        # Crea la directory se non esiste
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, 'prepare_analog_domicile_latest.json')
        stats_file = os.path.join(output_dir, 'statistics.json')
    
    # Carica i dati esistenti se il file esiste
    existing_data = {}
    
    if use_s3:
        # Leggi da S3
        existing_json = read_json_from_s3(output_file, profile_name)
        if existing_json:
            print(f"\nTrovato file esistente su S3: {output_file}")
            try:
                # Conta solo i casi che erano problematici (hasResult=false e isInPaperRequestError=false)
                for record in existing_json.get('analysis', []):
                    iun = record.get('iun')
                    has_result = record.get('hasResult', True)
                    is_in_paper_error = record.get('isInPaperRequestError', False)
                    
                    # Conta solo i casi problematici per le statistiche
                    if iun and not has_result and not is_in_paper_error:
                        existing_data[iun] = record
                print(f"Caricati {len(existing_data)} casi problematici esistenti da S3")
            except Exception as e:
                print(f"Errore nel parsing del file S3: {e}")
                existing_data = {}
    else:
        # Leggi da locale
        if os.path.exists(output_file):
            print(f"\nTrovato file esistente locale: {output_file}")
            try:
                with open(output_file, 'r', encoding='utf-8') as f:
                    existing_json = json.load(f)
                    # Conta solo i casi che erano problematici (hasResult=false e isInPaperRequestError=false)
                    for record in existing_json.get('analysis', []):
                        iun = record.get('iun')
                        has_result = record.get('hasResult', True)
                        is_in_paper_error = record.get('isInPaperRequestError', False)
                        
                        # Conta solo i casi problematici per le statistiche
                        if iun and not has_result and not is_in_paper_error:
                            existing_data[iun] = record
                print(f"Caricati {len(existing_data)} casi problematici esistenti da locale")
            except Exception as e:
                print(f"Errore nel caricamento del file esistente: {e}")
                existing_data = {}
    
    total = len(data_list)
    print(f"\nVerifica eventi follow-up per {total} IUN...")
    
    # Usa gli intervalli temporali passati come parametro
    start_time = followup_start_time
    end_time = followup_end_time
    
    # Estrae la lista di IUN unici dai nuovi dati + riverifica i vecchi
    new_iuns = list(set([row.get('iun', '') for row in data_list if row.get('iun', '')]))
    existing_iuns = list(existing_data.keys())
    all_iuns_to_check = set(new_iuns + existing_iuns)
    
    print(f"\nIUN nuovi da verificare: {len(new_iuns)}")
    print(f"IUN esistenti da riverificare: {len(existing_iuns)}")
    print(f"Totale IUN da verificare: {len(all_iuns_to_check)}")
    
    # Scarica TUTTI gli eventi SEND/COMPLETELY_UNREACHABLE nell'intervallo temporale
    result_map = download_followup_events(
        start_time, end_time, database, output_location, profile_name, workgroup, table
    )
    
    # Filtra solo gli IUN che ci interessano (match locale)
    print(f"\nMatch locale: confronto {len(all_iuns_to_check)} IUN con {len(result_map)} eventi scaricati...")
    matched_count = sum(1 for iun in all_iuns_to_check if iun in result_map)
    print(f"Trovati {matched_count} IUN con eventi follow-up")
    
    # Conta per tipo di evento
    send_count = sum(1 for iun in all_iuns_to_check if iun in result_map and result_map[iun][1] == 'SEND_ANALOG_DOMICILE')
    completely_unreachable_count = sum(1 for iun in all_iuns_to_check if iun in result_map and result_map[iun][1] == 'COMPLETELY_UNREACHABLE')
    
    # Crea un dizionario IUN -> dati PREPARE per tutti gli IUN (nuovi + esistenti)
    iun_to_data = {}
    for row in data_list:
        iun = row.get('iun', '')
        if iun:
            iun_to_data[iun] = row
    
    # Aggiungi i dati esistenti per gli IUN che non sono nei nuovi risultati
    for iun, old_record in existing_data.items():
        if iun not in iun_to_data:
            # Crea un record compatibile per la riverifica
            iun_to_data[iun] = {
                'iun': iun,
                'timestamp': old_record.get('timestamp', ''),
                'timelineElementId': old_record.get('timelineElementId', '')
            }
    
    # Raccogli tutti i timelineElementId per cui hasResult = false
    timeline_ids_to_check = []
    for iun, row in iun_to_data.items():
        timeline_id = row.get('timelineElementId', '')
        
        if iun in result_map:
            has_result, _ = result_map[iun]
        else:
            has_result = False
        
        if not has_result and timeline_id:
            timeline_ids_to_check.append(timeline_id)
    
    # Verifica su DynamoDB pn-PaperRequestError
    print(f"\nVerifica su DynamoDB pn-PaperRequestError per {len(timeline_ids_to_check)} timelineElementId...")
    dynamodb_map = check_dynamodb_paper_request_error(timeline_ids_to_check, profile_name)
    total_found_in_dynamodb = sum(1 for v in dynamodb_map.values() if v)
    print(f"Trovati {total_found_in_dynamodb} elementi in pn-PaperRequestError")
    
    # Filtra solo i campi richiesti e aggiungi i risultati della verifica
    filtered_results = []
    problematic_cases = []  # Solo i casi realmente problematici per le statistiche
    resolved_count = 0
    new_cases_count = 0
    
    for iun, row in iun_to_data.items():
        ts = row.get('timestamp', '')
        timeline_id = row.get('timelineElementId', '')
        
        # Verifica se questo IUN ha un risultato
        if iun in result_map:
            has_result, result_type = result_map[iun]
        else:
            has_result, result_type = False, None
        
        # Determina se è un caso problematico (per statistiche)
        is_problematic = False
        if not has_result:
            is_in_paper_error = dynamodb_map.get(timeline_id, False)
            is_problematic = not is_in_paper_error
        
        if full_analysis:
            # Modalità full analysis: stampa tutto
            filtered_row = {
                'timestamp': ts,
                'iun': iun,
                'timelineElementId': timeline_id,
                'hasResult': has_result
            }
            
            if has_result:
                filtered_row['hasResultType'] = result_type
            else:
                filtered_row['isInPaperRequestError'] = dynamodb_map.get(timeline_id, False)
            
            filtered_results.append(filtered_row)
            
            # Conta solo i casi problematici per le statistiche
            if is_problematic:
                problematic_cases.append(filtered_row)
                if iun not in existing_data:
                    new_cases_count += 1
        else:
            # Modalità standard: filtra solo i casi con hasResult=false e isInPaperRequestError=false
            if is_problematic:
                filtered_row = {
                    'timestamp': ts,
                    'iun': iun,
                    'timelineElementId': timeline_id,
                    'hasResult': False,
                    'isInPaperRequestError': False
                }
                filtered_results.append(filtered_row)
                problematic_cases.append(filtered_row)
                
                # Conta se è un nuovo caso
                if iun not in existing_data:
                    new_cases_count += 1
        
        # Conta i casi risolti (erano problematici, ora non lo sono più)
        if iun in existing_data and not is_problematic:
            resolved_count += 1
    
    print(f"\n=== Riepilogo Aggiornamento ===")
    if full_analysis:
        print(f"Modalità: FULL ANALYSIS (stampa tutti i risultati)")
        print(f"Totale risultati: {len(filtered_results)}")
        print(f"Casi problematici: {len(problematic_cases)}")
    print(f"Casi risolti (rimossi): {resolved_count}")
    print(f"Nuovi casi problematici: {new_cases_count}")
    print(f"Totale casi problematici ancora aperti: {len(problematic_cases)}")
    print("================================\n")
    
    # Prepara l'output dei dati
    output_data = {
        'analysis': filtered_results
    }
    
    # Salva il file JSON con i dati
    if use_s3:
        # Salva su S3
        if write_json_to_s3(output_data, output_file, profile_name):
            print(f"File risultati salvato su S3: {output_file}")
        else:
            print(f"ERRORE: Impossibile salvare su S3: {output_file}")
    else:
        # Salva locale
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    # Carica statistiche precedenti se esistono
    previous_stats = []
    if use_s3:
        # Leggi statistiche da S3
        stats_data = read_json_from_s3(stats_file, profile_name)
        if stats_data:
            previous_stats = stats_data.get('history', [])
    else:
        # Leggi statistiche da locale
        if os.path.exists(stats_file):
            try:
                with open(stats_file, 'r', encoding='utf-8') as f:
                    stats_data = json.load(f)
                    previous_stats = stats_data.get('history', [])
            except:
                previous_stats = []
    
    # Aggiungi le statistiche correnti (sempre basate sui casi problematici)
    # Usa prepare_end_time come timestamp (rappresenta fino a quando abbiamo analizzato)
    last_update_timestamp = prepare_end_time.strftime('%Y-%m-%d %H:%M:%S') if prepare_end_time else datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    
    # Calcola total_results come somma di verifica
    total_results = send_count + completely_unreachable_count + total_found_in_dynamodb
    
    current_stats = {
        'timestamp': last_update_timestamp,
        'total_iun_analyzed': len(all_iuns_to_check),
        'iun_with_send_analog': send_count,
        'iun_with_completely_unreachable': completely_unreachable_count,
        'found_in_paper_request_error': total_found_in_dynamodb,
        'total_results': total_results,
        'resolved_cases': resolved_count,
        'new_cases': new_cases_count,
        'total_open_cases': len(problematic_cases),
        'previous_open_cases': len(existing_data),
        'full_analysis_mode': full_analysis
    }
    
    previous_stats.append(current_stats)
    
    # Mantieni solo le ultime 30 esecuzioni
    if len(previous_stats) > 30:
        previous_stats = previous_stats[-30:]
    
    stats_output = {
        'last_update': last_update_timestamp,
        'summary': {
            'total_open_cases': current_stats['total_open_cases'],
            'resolved_in_last_run': current_stats['resolved_cases'],
            'new_in_last_run': current_stats['new_cases']
        },
        'history': previous_stats
    }
    
    # Salva le statistiche
    if use_s3:
        # Salva su S3
        if write_json_to_s3(stats_output, stats_file, profile_name):
            print(f"Statistiche salvate su S3: {stats_file}")
        else:
            print(f"ERRORE: Impossibile salvare statistiche su S3: {stats_file}")
    else:
        # Salva locale
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(stats_output, f, indent=2, ensure_ascii=False)
        print(f"Statistiche salvate localmente: {stats_file}")
    
    return output_file


def main():
    parser = argparse.ArgumentParser(
        description='Esegue query su Athena per trovare PREPARE_ANALOG_DOMICILE nell\'intervallo [-24h, -1h]'
    )
    parser.add_argument(
        '--profile',
        type=str,
        help='Profilo AWS da utilizzare',
        required=True
    )
    parser.add_argument(
        '--database',
        type=str,
        help='Database Athena da utilizzare',
        default='cdc_analytics_database'
    )
    parser.add_argument(
        '--table',
        type=str,
        help='Tabella Athena da interrogare (default: pn_timelines_json_view)',
        default='pn_timelines_json_view'
    )
    parser.add_argument(
        '--output-location',
        type=str,
        help='Percorso S3 per i risultati (es: s3://bucket-name/athena-results/)',
        required=True
    )
    parser.add_argument(
        '--workgroup',
        type=str,
        help='Workgroup Athena da utilizzare (default: primary)',
        default='primary'
    )
    parser.add_argument(
        '--start-time',
        type=str,
        help='Ora di inizio assoluta (formato: YYYY-MM-DD HH:MM:SS). Se non specificato, usa last_update da statistics.json o default -24h',
        default=None
    )
    parser.add_argument(
        '--end-time',
        type=str,
        help='Ora di fine assoluta (formato: YYYY-MM-DD HH:MM:SS). Default: now - 1 ora',
        default=None
    )
    parser.add_argument(
        '--full-analysis',
        action='store_true',
        help='Stampa tutti i risultati, non solo i casi con hasResult=false e isInPaperRequestError=false',
        default=False
    )
    parser.add_argument(
        '--timeout',
        type=int,
        help='Timeout in secondi per l\'esecuzione (default: 840 secondi = 14 minuti)',
        default=840
    )
    parser.add_argument(
        '--s3-result-bucket',
        type=str,
        help='Bucket S3 dove salvare i file JSON di risultato (es: s3://bucket-name/path/). Se non specificato, salva in locale',
        default=None
    )
    
    args = parser.parse_args()
    
    # Imposta il timeout
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(args.timeout)
    
    try:
        # Calcola gli intervalli temporali
        now = datetime.utcnow()
        
        # Percorso file statistiche (locale o S3)
        script_dir = Path(__file__).parent
        result_dir = script_dir / 'result'
        
        # Carica last_update da statistics.json se esiste
        last_update = None
        if not args.start_time:
            if args.s3_result_bucket:
                # Leggi da S3
                s3_bucket = args.s3_result_bucket.rstrip('/')
                s3_stats_file = f"{s3_bucket}/statistics.json"
                stats_data = read_json_from_s3(s3_stats_file, args.profile)
                if stats_data:
                    last_update_str = stats_data.get('last_update')
                    if last_update_str:
                        last_update = datetime.strptime(last_update_str, '%Y-%m-%d %H:%M:%S')
                        print(f"Trovato last_update da S3: {last_update_str}")
            else:
                # Leggi da locale
                stats_file = result_dir / 'statistics.json'
                if stats_file.exists():
                    try:
                        with open(stats_file, 'r', encoding='utf-8') as f:
                            stats_data = json.load(f)
                            last_update_str = stats_data.get('last_update')
                            if last_update_str:
                                last_update = datetime.strptime(last_update_str, '%Y-%m-%d %H:%M:%S')
                                print(f"Trovato last_update locale: {last_update_str}")
                    except Exception as e:
                        print(f"Errore nel caricamento di statistics.json: {e}")
        
        # Determina start_time
        if args.start_time:
            # Manuale
            start_time = datetime.strptime(args.start_time, '%Y-%m-%d %H:%M:%S')
            print(f"Usando start_time manuale: {start_time}")
        elif last_update:
            # Riprende da last_update (esecuzione incrementale)
            start_time = last_update
            print(f"Esecuzione incrementale: start_time = last_update")
        else:
            # Prima esecuzione o statistics.json non trovato
            start_time = now - timedelta(hours=24)
            print(f"Prima esecuzione: start_time = now - 24h")
        
        # Determina end_time
        if args.end_time:
            end_time = datetime.strptime(args.end_time, '%Y-%m-%d %H:%M:%S')
        else:
            end_time = now - timedelta(hours=1)
        
        # Validazione: end_time deve essere almeno 1 ora prima di now
        min_end_time = now - timedelta(hours=1)
        if end_time > min_end_time:
            print(f"ATTENZIONE: end_time troppo vicino a now. Forzato a now - 1h")
            end_time = min_end_time
        
        # Validazione: start_time deve essere prima di end_time
        if start_time >= end_time:
            print(f"ERRORE: start_time ({start_time}) deve essere prima di end_time ({end_time})")
            sys.exit(1)
        
        # Calcola la durata dell'intervallo
        interval_hours = (end_time - start_time).total_seconds() / 3600
        print(f"Intervallo da analizzare: {interval_hours:.1f} ore")
        
        # Formatta le date per la query
        start_time_str = start_time.strftime('%Y-%m-%d %H:%M:%S')
        end_time_str = end_time.strftime('%Y-%m-%d %H:%M:%S')
        
        output_location = args.output_location
        
        print(f"\n=== Parametri Query ===")
        print(f"Profilo AWS: {args.profile}")
        print(f"Ricerca PREPARE_ANALOG_DOMICILE tra {start_time_str} e {end_time_str}")
        print(f"Database: {args.database}")
        print(f"Workgroup: {args.workgroup}")
        print(f"Output location: {output_location}")
        print("========================\n")
        
        # Costruisce la query
        # Il timestamp nella tabella è in formato ISO 8601 con 'T' e 'Z'
        start_time_iso = start_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        end_time_iso = end_time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        # Usa le partizioni per filtrare più velocemente
        # Calcola le partizioni da includere (tutti i giorni dall'inizio alla fine)
        partition_filter = []
        current_date = start_time.date()
        end_date = end_time.date()
        while current_date <= end_date:
            year = current_date.strftime('%Y')
            month = current_date.strftime('%m')
            day = current_date.strftime('%d')
            partition_filter.append(f"(p_year = '{year}' AND p_month = '{month}' AND p_day = '{day}')")
            current_date += timedelta(days=1)
        
        partition_condition = " OR ".join(partition_filter)
        
        query = f"""
        SELECT 
            timestamp,
            iun,
            timelineElementId,
            category
        FROM 
            {args.table}
        WHERE 
            category = 'PREPARE_ANALOG_DOMICILE'
            AND ({partition_condition})
            AND timestamp >= '{start_time_iso}'
            AND timestamp < '{end_time_iso}'
        ORDER BY 
            timestamp DESC
        """
        
        print(f"\nQuery:\n{query}\n")
        
        # Esegue la query
        query_execution_id = execute_athena_query(
            query=query,
            database=args.database,
            output_location=output_location,
            profile_name=args.profile,
            workgroup=args.workgroup
        )
        
        # Recupera e formatta i risultati
        results = get_query_results(query_execution_id, args.profile)
        data_list = format_results(results)
    
        # Intervalli temporali per la ricerca follow-up: dallo start_time fino a now
        followup_start_time = start_time
        followup_end_time = now
        
        # Salva i risultati in JSON nella directory result o S3
        if data_list:
            json_file = save_results_to_json(
                data_list, 
                result_dir, 
                args.database,
                output_location,
                followup_start_time,
                followup_end_time,
                args.full_analysis,
                args.profile, 
                args.workgroup,
                prepare_end_time=end_time,
                s3_bucket=args.s3_result_bucket,
                table=args.table
            )
            print(f"\nRisultati salvati: {json_file}")
        else:
            print(f"\nNessun nuovo risultato da salvare")
        
        print(f"\nI risultati completi CSV sono salvati in: {output_location}{query_execution_id}.csv")
        
        # Disabilita l'alarm
        signal.alarm(0)
        print(f"\nEsecuzione completata con successo!")
        
    except TimeoutError:
        print(f"\nTimeout raggiunto dopo {args.timeout} secondi")
        print(f"I progressi sono stati salvati e l'esecuzione riprenderà dal checkpoint al prossimo giro")
        sys.exit(2)  # Exit code 2 per timeout
    except KeyboardInterrupt:
        print(f"\nEsecuzione interrotta dall'utente")
        signal.alarm(0)
        sys.exit(130)
    except Exception as e:
        print(f"\nErrore durante l'esecuzione: {e}")
        signal.alarm(0)
        raise


if __name__ == '__main__':
    main()
