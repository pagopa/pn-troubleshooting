# pn-troubleshooting

Useful troubleshooting scripts

## Useful command line

### X-Ray trace id timestamp conversion

E' possibile estrarre il time stamp dal X-Ray trace id.

Esempio:

`Root=1-64baa554-4ed7c4a915bb316a17082a5f`

Il valore tra i due separatori `64baa554` è la codifica esadecimale del timestamp in epoch, per convertirlo:

```bash
XRAYTIME=64baa554
date -r $((16#$XRAYTIME"))
Fri Jul 21 17:33:40 CEST 2023
```

In formato UTC
```bash
XRAYTIME=64baa554
date -u -r $((16#$XRAYTIME"))
Fri Jul 21 15:33:40 UTC 2023
```