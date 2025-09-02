# Bonifica notifiche pregresse pn-paper-tracker

## Usage
```
    CORE_AWS_PROFILE=sso_pn-core-dev \
    CONFINFO_AWS_PROFILE=sso_pn-confinfo-dev \
    TRACKING_API_HOST=http://localhost:8080 \
    node index.js paper_request_ids.txt
```

## 🔎 Recupero eventi pn-paper-tracker (`/paper-tracker-private/v1/trackings`)

```bash
curl -X POST "https://<base-url>/paper-tracker-private/v1/trackings" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingIds": [
      "PREPARE_ANALOG_DOMICILE.IUN_LNKN-UHAM-KEZH-202508-X-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0",
      "PREPARE_ANALOG_DOMICILE.IUN_LNKN-UHAM-KEZH-202508-X-2.RECINDEX_0.ATTEMPT_0.PCRETRY_1"
    ]
  }'
```


## 🔎 Recupero errori pn-paper-tracker(/paper-tracker-private/v1/errors)

```bash
curl -X POST "https://<base-url>/paper-tracker-private/v1/errors" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingIds": [
      "PREPARE_ANALOG_DOMICILE.IUN_LNKN-UHAM-KEZH-202508-X-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0",
      "PREPARE_ANALOG_DOMICILE.IUN_LNKN-UHAM-KEZH-202508-X-2.RECINDEX_0.ATTEMPT_0.PCRETRY_1"
    ]
  }'
```