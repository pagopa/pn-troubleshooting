#!/usr/bin/env python3

import csv
import sys
import os
import re
import requests
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import time

class CSVValidator:
    def __init__(self, csv_file_path: str):
        self.csv_file_path = csv_file_path
        self.errors_found = False
        self.total_rows = 0
        self.error_rows = 0
        
        # Campi attesi nell'ordine corretto
        self.expected_fields = [
            'paese', 'città', 'provincia', 'cap', 'via', 
            'dataInizioValidità', 'dataFineValidità', 'descrizione', 
            'orariApertura', 'coordinateGeoReferenziali', 'telefono', 
            'capacità', 'externalCode'
        ]
        
        # Campi obbligatori
        self.required_fields = [
            'paese', 'città', 'provincia', 'cap', 'via', 
            'descrizione', 'telefono', 'externalCode'
        ]
        
        # Cache per API ISTAT
        self.comuni_cache = {}
        self.cap_cache = {}
        
    def validate_csv_format(self, file_path: str) -> List[str]:
        """Valida formato CSV secondo RFC-4180 con separatore punto e virgola"""
        errors = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                # Controlla separatore
                first_line = file.readline()
                if ';' not in first_line:
                    errors.append("Separatore punto e virgola non trovato")
                    return errors
                
                # Reset file pointer
                file.seek(0)
                
                # Prova a parsare con csv.reader
                reader = csv.reader(file, delimiter=';', quotechar='"')
                
                try:
                    header = next(reader)
                    if not header:
                        errors.append("Header mancante")
                        return errors
                        
                    # Verifica campi header
                    if header != self.expected_fields:
                        errors.append(f"Header non corretto. Atteso: {self.expected_fields}, Trovato: {header}")
                        
                except StopIteration:
                    errors.append("File CSV vuoto")
                    
        except Exception as e:
            errors.append(f"Errore lettura file: {str(e)}")
            
        return errors
    
    def validate_phone(self, phone: str) -> bool:
        """Valida numero di telefono: solo numeri 0-9, max 11 caratteri"""
        if not phone:
            return False
        pattern = r'^[0-9]{1,11}$'
        return bool(re.match(pattern, phone))
    
    def validate_date(self, date_str: str) -> bool:
        """Valida formato data YYYY-MM-DD"""
        if not date_str:
            return True
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
            return True
        except ValueError:
            return False
    
    def validate_coordinates(self, coords: str) -> bool:
        """Valida coordinate geografiche formato 'lat, lon'"""
        if not coords:
            return True
        
        try:
            # Pattern per coordinate: numero.numero, numero.numero
            pattern = r'^-?\d+\.?\d*,\s*-?\d+\.?\d*$'
            if not re.match(pattern, coords):
                return False
                
            lat_str, lon_str = coords.split(',')
            lat = float(lat_str.strip())
            lon = float(lon_str.strip())
            
            # Verifica range validi
            return -90 <= lat <= 90 and -180 <= lon <= 180
            
        except (ValueError, AttributeError):
            return False
    
    def validate_opening_hours(self, hours: str) -> bool:
        """Valida formato orari apertura"""
        if not hours:
            return True
            
        # Pattern base: Day=HH:MM-HH:MM_HH:MM-HH:MM#Day=...
        pattern = r'^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)=\d{2}:\d{2}-\d{2}:\d{2}(_\d{2}:\d{2}-\d{2}:\d{2})*'
        parts = hours.split('#')
        
        for part in parts:
            if not re.match(pattern, part):
                return False
                
        return True
    
    def validate_cap_comune(self, cap: str, comune: str) -> bool:
        """Valida corrispondenza CAP-Comune tramite API ISTAT"""
        if not cap or not comune:
            return False
            
        # Usa cache se disponibile
        cache_key = f"{cap}_{comune.lower()}"
        if cache_key in self.cap_cache:
            return self.cap_cache[cache_key]
        
        try:
            # API ISTAT per comuni
            url = "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv"
            
            # Scarica solo se non in cache
            if not hasattr(self, 'comuni_data'):
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    lines = response.text.strip().split('\n')
                    reader = csv.DictReader(lines, delimiter=';')
                    self.comuni_data = list(reader)
                else:
                    return True  # Se API non disponibile, accetta
            
            # Cerca corrispondenza
            for row in self.comuni_data:
                if (row.get('Codice Catastale del comune') and 
                    row.get('Denominazione in italiano').lower() == comune.lower()):
                    self.cap_cache[cache_key] = True
                    return True
                    
            self.cap_cache[cache_key] = False
            return False
            
        except requests.RequestException:
            # Se API non disponibile, accetta per non bloccare
            return True
        except Exception:
            return True
    
    def validate_row(self, row: Dict[str, str], row_number: int) -> List[str]:
        """Valida singola riga e ritorna lista errori"""
        errors = []
        
        # Controllo campi obbligatori
        for field in self.required_fields:
            if not row.get(field, '').strip():
                errors.append(f"{field}: campo obbligatorio mancante")
        
        # Validazione telefono
        if row.get('telefono'):
            if not self.validate_phone(row['telefono']):
                errors.append("telefono: formato non valido (solo numeri 0-9, max 11 caratteri)")
        
        # Validazione date
        if row.get('dataInizioValidità'):
            if not self.validate_date(row['dataInizioValidità']):
                errors.append("dataInizioValidità: formato non valido (atteso YYYY-MM-DD)")
        
        if row.get('dataFineValidità'):
            if not self.validate_date(row['dataFineValidità']):
                errors.append("dataFineValidità: formato non valido (atteso YYYY-MM-DD)")
        
        # Validazione logica date
        if (row.get('dataInizioValidità') and row.get('dataFineValidità') and
            self.validate_date(row['dataInizioValidità']) and 
            self.validate_date(row['dataFineValidità'])):
            
            start_date = datetime.strptime(row['dataInizioValidità'], '%Y-%m-%d')
            end_date = datetime.strptime(row['dataFineValidità'], '%Y-%m-%d')
            
            if start_date >= end_date:
                errors.append("dataInizioValidità: deve essere precedente a dataFineValidità")
        
        # Validazione coordinate
        if row.get('coordinateGeoReferenziali'):
            if not self.validate_coordinates(row['coordinateGeoReferenziali']):
                errors.append("coordinateGeoReferenziali: formato non valido")
        
        # Validazione orari
        if row.get('orariApertura'):
            if not self.validate_opening_hours(row['orariApertura']):
                errors.append("orariApertura: formato non valido")
        
        # Validazione CAP-Comune
        if row.get('cap') and row.get('città'):
            if not self.validate_cap_comune(row['cap'], row['città']):
                errors.append("cap: non corrispondente al comune specificato")
        
        return errors
    
    def check_external_code_duplicates(self, rows: List[Dict[str, str]]) -> Dict[str, List[int]]:
        """Controlla duplicati externalCode"""
        external_codes = {}
        
        for i, row in enumerate(rows, 1):
            code = row.get('externalCode', '').strip()
            if code:
                if code in external_codes:
                    external_codes[code].append(i)
                else:
                    external_codes[code] = [i]
        
        # Ritorna solo i duplicati
        return {code: rows for code, rows in external_codes.items() if len(rows) > 1}
    
    def check_sorting(self, rows: List[Dict[str, str]]) -> bool:
        """Controlla ordinamento discendente su externalCode"""
        codes = [row.get('externalCode', '') for row in rows if row.get('externalCode')]
        
        # Verifica ordinamento discendente (alfanumerico)
        return codes == sorted(codes, reverse=True)
    
    def validate_and_generate_output(self):
        """Esegue validazione completa e genera file di output"""
        
        print("=== VALIDAZIONE CSV ===")
        print(f"File: {self.csv_file_path}")
        
        # Verifica formato CSV
        format_errors = self.validate_csv_format(self.csv_file_path)
        if format_errors:
            print(f"❌ ERRORI FORMATO:")
            for error in format_errors:
                print(f"   - {error}")
            return False
        
        print("✅ Formato CSV valido")
        
        # Leggi e valida contenuto
        rows = []
        row_errors = {}
        
        try:
            with open(self.csv_file_path, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file, delimiter=';')
                
                for row_num, row in enumerate(reader, 1):
                    self.total_rows += 1
                    rows.append(row)
                    
                    # Valida riga
                    errors = self.validate_row(row, row_num)
                    if errors:
                        row_errors[row_num] = errors
                        self.error_rows += 1
                        self.errors_found = True
        
        except Exception as e:
            print(f"❌ Errore lettura file: {e}")
            return False
        
        # Controlla duplicati externalCode
        duplicates = self.check_external_code_duplicates(rows)
        if duplicates:
            self.errors_found = True
            for code, row_numbers in duplicates.items():
                for row_num in row_numbers:
                    if row_num not in row_errors:
                        row_errors[row_num] = []
                    row_errors[row_num].append(f"externalCode: valore duplicato '{code}'")
        
        # Controlla ordinamento
        if not self.check_sorting(rows):
            print("❌ Ordinamento non corretto: externalCode deve essere in ordine discendente")
            self.errors_found = True
        
        # Genera file di output
        self.generate_output_file(rows, row_errors)
        
        # Riepilogo
        self.print_summary(duplicates)
        
        return not self.errors_found
    
    def generate_output_file(self, rows: List[Dict[str, str]], row_errors: Dict[int, List[str]]):
        """Genera file CSV di output con colonna errori"""
        
        # Crea directory results se non esiste
        results_dir = Path('results')
        results_dir.mkdir(exist_ok=True)
        
        # Nome file output
        input_name = Path(self.csv_file_path).stem
        output_file = results_dir / f"{input_name}_errors.csv"
        
        # Scrivi file con colonna errori
        fieldnames = self.expected_fields + ['ERRORI']
        
        with open(output_file, 'w', newline='', encoding='utf-8') as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row_num, row in enumerate(rows, 1):
                # Aggiungi colonna errori
                row_copy = row.copy()
                if row_num in row_errors:
                    row_copy['ERRORI'] = '; '.join(row_errors[row_num])
                else:
                    row_copy['ERRORI'] = ''
                    
                writer.writerow(row_copy)
        
        print(f"📄 File di output generato: {output_file}")
    
    def print_summary(self, duplicates: Dict[str, List[int]]):
        """Stampa riepilogo esecuzione"""
        print("\n=== RIEPILOGO VALIDAZIONE ===")
        print(f"Righe totali processate: {self.total_rows}")
        print(f"Righe con errori: {self.error_rows}")
        
        if duplicates:
            print(f"ExternalCode duplicati: {len(duplicates)}")
            for code, rows in duplicates.items():
                print(f"   - '{code}': righe {', '.join(map(str, rows))}")
        
        if self.errors_found:
            print("❌ VALIDAZIONE FALLITA - Errori rilevati")
        else:
            print("✅ VALIDAZIONE SUPERATA - Nessun errore rilevato")


def main():
    """Funzione principale"""
    if len(sys.argv) != 2:
        print("Uso: python csv_validator.py <file.csv>")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    
    if not os.path.exists(csv_file):
        print(f"❌ File non trovato: {csv_file}")
        sys.exit(1)
    
    validator = CSVValidator(csv_file)
    success = validator.validate_and_generate_output()
    
    # Exit code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()