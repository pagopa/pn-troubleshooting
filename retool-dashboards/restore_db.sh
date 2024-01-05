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

backup_dir="pg_backups"
mkdir -p "$backup_dir"

# Set the backup file name with a timestamp
backup_file="$backup_dir/backup.sql"

# Check if backup file exists
if [ ! -f "$backup_file" ]; then
  echo "Error: "$backup_file" file not found."
  exit 1
fi

# Perform the PostgreSQL restore
# Drop the existing database
docker exec -i retool-onpremise-postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" > /dev/null 2>&1
# Create a new database
docker exec -i retool-onpremise-postgres psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB;" > /dev/null 2>&1
docker exec -i retool-onpremise-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$backup_file" > /dev/null 2>&1

# Check the exit codes
if [ $? -eq 0 ]; then
  echo "Database restore successful."
else
  echo "Error: Failed to restore the database."
  exit 1
fi