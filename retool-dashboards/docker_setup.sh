#!/bin/sh

temp_env_file="./docker.env.template"
env_file="./docker.env"

postgresPassword=$(cat /dev/urandom | base64 | head -c 64)
retooldbPostgresPassword=$(cat /dev/urandom | base64 | head -c 64)
jwtSecret=$(cat /dev/urandom | base64 | head -c 256)
encryptionKey=$(cat /dev/urandom | base64 | head -c 64)

update_or_add_variable() {
    local env_file="$1"
    local variable_name="$2"
    local new_value="$3"
    # Controlla se la variabile esiste nel file
    if grep -q "^$variable_name=" "$env_file"; then
        # Se esiste, sostituisci il valore
        sed -i '' "/^$variable_name=/s/=.*/=${new_value//\//\\/}/" "$env_file"
    else
        # Se non esiste, aggiungi una nuova riga
        echo "$variable_name=$new_value" >> "$env_file"
    fi
}

if [ -f $env_file ]; then
  echo "Found existing docker.env file..."
  echo "Exiting to avoid overwriting existing the configuration file..."
  exit 0
fi

license_key=''
echo "Paste your license key. Get yours at https://my.retool.com/"
read -p "License key: " license_key

cp ./docker.env.template ./docker.env
update_or_add_variable "$env_file" "JWT_SECRET" "$jwtSecret"
update_or_add_variable "$env_file" "POSTGRES_PASSWORD" "$postgresPassword"
# update_or_add_variable "$env_file" "ENCRYPTION_KEY" "$encryptionKey"
update_or_add_variable "$env_file" "LICENSE_KEY" "$license_key"
