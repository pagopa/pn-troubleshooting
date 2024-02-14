# Group Paper Errors

Lo script riceve in input un dump della tabella **pn-PaperErrors** e genera un json con la seguente struttura:
```
{
    <errorCode1>: {
        count: <count>,
        items: [<error1>,<error2>,... <errorN>]
    },

    <errorCode2>: {
        count: <count>,
        items: [<error3>,<error4>,... <errorN>]
    },

    ... 

    <errorCodeN>: {
        count: <count>,
        items: [<error5>,<error6>,... <errorN>]
    }
}
```

## Istruzioni

`node index.is <fileName>` dove:
- `<fileName>` è il path al file con il dump della tabella pn-PaperErrors

