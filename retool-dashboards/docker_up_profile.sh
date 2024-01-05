#!/bin/sh

env_file='./docker.env'
restore_db=false

get_credentials() {
    echo "Getting credentials"
    result=$( aws configure export-credentials --profile "$1" --format env 2>&1 )
    if ! [ $? -eq 0 ] || [[ "$result" == *"expired"* ]]; then
        login_sso $1
        get_credentials $1
    else
        eval "$result"
        echo "Updating $env_file"
        update_or_add_variable "$env_file" "AWS_ACCESS_KEY_ID" "$AWS_ACCESS_KEY_ID"
        update_or_add_variable "$env_file" "AWS_SECRET_ACCESS_KEY" "$AWS_SECRET_ACCESS_KEY"
        update_or_add_variable "$env_file" "AWS_SESSION_TOKEN" "$AWS_SESSION_TOKEN"
        echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
        echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
        echo "AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN"
    fi
}

login_sso() {
    aws sso login --profile $1
    if ! [ $? -eq 0 ]; then
        exit 1
    fi
}

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

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <aws-profile> [--restore_db]"
    exit 1
fi

profile=$1
shift

if [ "$1" == "--restore_db" ]; then
    restore_db=true
    shift
fi

if ! [ -f "$env_file" ]; then
    ./docker_setup.sh
fi

get_credentials $profile

if [ "$restore_db" = true ]; then
    docker compose stop
    docker compose up -d postgres
    sleep 5
    ./restore_db.sh
fi

docker compose up --build --detach
echo "Retool is up at http://localhost:3000"