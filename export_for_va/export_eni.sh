#!/usr/bin/env bash

set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  echo "Cleaning up..."
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)


usage() {
      cat <<EOF
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -p <aws-profile> -r <aws-region>
    [-h]                      : this help message
    -p <aws-profile>          : aws-profile
    -r <aws-region>           : aws-region
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  work_dir=$HOME
  aws_profile=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -p | --profile) 
      aws_profile="${2-}"
      shift
      ;;
    -r | --region) 
      aws_region="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

   # check required params and arguments
  [[ -z "${aws_profile-}" ]] && usage 
  [[ -z "${aws_region-}" ]] && usage
  
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS Profile:        ${aws_profile}"
  echo "AWS Region:         ${aws_region}"
}

# START SCRIPT

parse_params "$@"
dump_params

echo ""
echo "=== Base AWS command parameters"
aws_command_base_args=""
if ( [ ! -z "${aws_profile}" ] ) then
  aws_command_base_args="${aws_command_base_args} --profile $aws_profile"
fi
if ( [ ! -z "${aws_region}" ] ) then
  aws_command_base_args="${aws_command_base_args} --region  $aws_region"
fi
echo ${aws_command_base_args}

echo "STARTING EXECUTION"

echo "Create output directory if not exist"

output_dir=./output/eni_$(date +%Y%m%d)_$aws_profile

mkdir -p $output_dir

cd $output_dir

# Nome del file CSV di output
output_file="network_interfaces.csv"
temp_file="temp_network_interfaces.csv"

# Scrive l'intestazione del CSV, aggiungendo le colonne "Microservice" e "SecurityGroupName"
echo "Description,Network Interface,IP Address,Availability Zone,Interface Type,Microservice,SecurityGroupName" > $output_file

# Ottieni l'elenco delle subnet con il tag pn-eni-related=true nella regione specificata
subnets=$(aws ${aws_command_base_args} ec2 describe-subnets --query 'Subnets[*].SubnetId' --output text)
echo "Subnets trovate: $subnets"

# Elimina il file temporaneo se esiste
rm -f $temp_file

for subnet in $subnets; do
    echo "Processando subnet: $subnet"
    # Ottieni l'elenco delle network interface associate alla subnet corrente con le informazioni richieste
    interfaces=$(aws ${aws_command_base_args} ec2 describe-network-interfaces  --filters "Name=subnet-id,Values=$subnet" --output json)
    
    echo "Interfacce trovate per subnet $subnet: $interfaces"

    # Loop attraverso ciascuna network interface
    echo "$interfaces" | jq -c '.NetworkInterfaces[]' | while IFS= read -r interface; do
        network_interface_id=$(echo "$interface" | jq -r '.NetworkInterfaceId')
        private_ip_address=$(echo "$interface" | jq -r '.PrivateIpAddress // "None"')
        availability_zone=$(echo "$interface" | jq -r '.AvailabilityZone // "None"')
        interface_type=$(echo "$interface" | jq -r '.InterfaceType // "None"')
        description=$(echo "$interface" | jq -r '.Description // "None"')

        # Estrai il SecurityGroupName
        security_group_name=$(echo "$interface" | jq -r '.Groups[0].GroupName // "None"')

        # Determina il valore di Microservice
        microservice=$(echo "$interface" | jq -r '.TagSet[] | select(.Key == "Microservice") | .Value // empty')
        if [[ -z "$microservice" ]]; then
            if [[ "$description" == *"arn:aws:ecs"* ]]; then
                # Se è ECS, ricava le prime tre sezioni del SecurityGroupName
                microservice=$(echo "$security_group_name" | awk -F'-' '{print $1"-"$2"-"$3}')
            else
                microservice="NoMicroservice"
            fi
        fi

        # Scrivi le informazioni nel file temporaneo
        echo "$description,$network_interface_id,$private_ip_address,$availability_zone,$interface_type,$microservice,$security_group_name" >> $temp_file
    done
done

# Raggruppa e scrivi le informazioni raggruppate nel file CSV finale
sort $temp_file | uniq | while IFS=, read -r description network_interface_id private_ip_address availability_zone interface_type microservice security_group_name; do
    echo "$description,$network_interface_id,$private_ip_address,$availability_zone,$interface_type,$microservice,$security_group_name" >> $output_file
done

# Rimuovi il file temporaneo
rm -f $temp_file

echo "Output scritto nel file $output_file"
