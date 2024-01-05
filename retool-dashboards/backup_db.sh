#!/bin/sh

# Check if docker.env file exists
if [ ! -f "docker.env" ]; then
  echo "Error: docker.env file not found."
  exit 1
fi

# Load environment variables from docker.env
export $(grep -v '^#' docker.env | xargs)

# Check if required PostgreSQL credentials are set
if [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ]; then
  echo "Error: Missing PostgreSQL credentials in docker.env file."
  exit 1
fi

# Create a backup directory
backup_dir="pg_backups"
mkdir -p "$backup_dir"

# Set the backup file name with a timestamp
backup_file="$backup_dir/backup.sql"

# Perform the PostgreSQL backup
docker exec -t retool-onpremise-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$backup_file"
# Check if the backup was successful
if [ $? -eq 0 ]; then
  echo "Backup successful. Backup file: $backup_file"
else
  echo "Error: Backup failed."
fi