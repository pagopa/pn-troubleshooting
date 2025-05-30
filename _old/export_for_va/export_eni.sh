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
  aws_profile=""
  aws_region=""

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
    -?*) echo "Unknown option: $1" && usage ;;
    *) break ;;
    esac
    shift
  done

  [[ -z "${aws_profile-}" ]] && usage
  [[ -z "${aws_region-}" ]] && usage

  return 0
}

dump_params() {
  echo ""
  echo "######      PARAMETERS      ######"
  echo "AWS Profile:        ${aws_profile}"
  echo "AWS Region:         ${aws_region}"
  echo "##################################"
}

# START SCRIPT

parse_params "$@"
dump_params

echo ""
echo "=== Base AWS command parameters ==="
aws_command_base_args=""
if [[ -n "${aws_profile}" ]]; then
  aws_command_base_args="${aws_command_base_args} --profile $aws_profile"
fi
if [[ -n "${aws_region}" ]]; then
  aws_command_base_args="${aws_command_base_args} --region $aws_region"
fi
echo "AWS Command Base Args: ${aws_command_base_args}"

echo "STARTING EXECUTION"

output_dir=./output/eni_$(date +%Y%m%d)_$aws_profile
mkdir -p "$output_dir"
cd "$output_dir"

output_file="network_interfaces.csv"
temp_file="temp_network_interfaces.csv"

# Inizializzazione CSV
echo "Description,Network Interface,IP Address,Availability Zone,Interface Type,Microservice,SecurityGroupName,VpcId" > "$output_file"

# Passo 1: Generazione del CSV con tutte le ENI
echo "Generazione del CSV con export totale..."
subnets=$(aws ${aws_command_base_args} ec2 describe-subnets --query 'Subnets[*].SubnetId' --output text)

rm -f "$temp_file"

for subnet in $subnets; do
    interfaces=$(aws ${aws_command_base_args} ec2 describe-network-interfaces \
        --filters "Name=subnet-id,Values=$subnet" --output json)

    echo "$interfaces" | jq -c '.NetworkInterfaces[]' | while IFS= read -r interface; do
        network_interface_id=$(echo "$interface" | jq -r '.NetworkInterfaceId')
        private_ip_address=$(echo "$interface" | jq -r '.PrivateIpAddress // "None"')
        availability_zone=$(echo "$interface" | jq -r '.AvailabilityZone // "None"')
        interface_type=$(echo "$interface" | jq -r '.InterfaceType // "None"')
        description=$(echo "$interface" | jq -r '.Description // "None"')
        security_group_name=$(echo "$interface" | jq -r '.Groups[0].GroupName // "None"')
        vpc_id=$(echo "$interface" | jq -r '.VpcId // "None"')

        microservice=$(echo "$interface" | jq -r '.TagSet[] | select(.Key == "Microservice") | .Value // empty')
        if [[ -z "$microservice" ]]; then
            if [[ "$description" == *"arn:aws:ecs"* ]]; then
                microservice=$(echo "$security_group_name" | awk -F'-' '{print $1"-"$2"-"$3}')
            else
                microservice="NoMicroservice"
            fi
        fi

        echo "$description,$network_interface_id,$private_ip_address,$availability_zone,$interface_type,$microservice,$security_group_name,$vpc_id" >> "$temp_file"
    done
done

# Ordina alfabeticamente per la colonna Description e aggiunge al file CSV
sort -t, -k1,1 "$temp_file" | uniq >> "$output_file"
rm -f "$temp_file"
echo "CSV con export totale generato e ordinato: $output_file"

# Step 2: Generazione del CSV filtrato per ciascuna VPC
echo "Generazione dei CSV per ogni VPC con PN nel tag Name"

vpcs=$(aws ${aws_command_base_args} ec2 describe-vpcs \
       --filters "Name=tag:Name,Values=*PN*" \
       --query "Vpcs[].VpcId" --output text)

for vpc_id in $vpcs; do
    vpc_name=$(aws ${aws_command_base_args} ec2 describe-vpcs --vpc-ids "$vpc_id" \
               --query "Vpcs[0].Tags[?Key=='Name'].Value | [0]" --output text)

    if [[ -z "$vpc_name" || "$vpc_name" == "None" ]]; then
        echo "Nessun nome trovato per la VPC $vpc_id. Skip VPC."
        continue
    fi

    echo "Analisi della VPC: $vpc_name ($vpc_id)"

    instance_az=$(aws ${aws_command_base_args} ec2 describe-instances \
                  --filters "Name=tag:Name,Values=*nessus*" "Name=vpc-id,Values=$vpc_id" \
                  --query "Reservations[*].Instances[0].[Placement.AvailabilityZone]" --output text)

    if [[ -z "$instance_az" || "$instance_az" == "None" ]]; then
        echo "Nessuna istanza trovata con il tag 'nessus' nella VPC $vpc_name. Skip VPC."
        continue
    fi

    filtered_output_file="network_interfaces_filtered_${vpc_name// /_}.csv"

    # Scrive la riga di intestazione nel file una sola volta
    echo "Description,Network Interface,IP Address,Availability Zone,Interface Type,Microservice,SecurityGroupName,VpcId" > "$filtered_output_file"

    # Filtra il CSV generale per includere solo le righe relative alla VPC corrente e ordina
    awk -F, -v az="$instance_az" -v vpc_id="$vpc_id" '
    BEGIN { OFS = FS }
    NR == 1 { next } # Salta la riga di intestazione del file generale
    $8 == vpc_id { # Solo righe della VPC corrente
        if ($6 == "NoMicroservice" && $4 == az) {
            print
        } else if ($6 != "NoMicroservice") {
            if (!seen[$6]++) {
                if ($4 == az) {
                    print; prioritized[$6] = 1
                } else if (!prioritized[$6]) {
                    fallback[$6] = $0
                }
            }
        }
    }
    END {
        for (m in fallback) if (!prioritized[m]) print fallback[m]
    }
    ' "$output_file" | sort -t, -k1,1 >> "$filtered_output_file"

    echo "CSV specifico per la VPC $vpc_name generato e ordinato: $filtered_output_file"
done

echo "FINE SCRIPT."
