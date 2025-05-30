const fs = require('fs')

const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((r) =>  JSON.parse(r))

const errorGroups = {

}

rows.forEach((r) => {
    const errorGroup = r.error.S
    if(!errorGroups[errorGroup]){
        errorGroups[errorGroup] = {
            count: 0,
            items: []
        }
    }

    errorGroups[errorGroup].count++
    errorGroups[errorGroup].items.push(r)
})

fs.writeFileSync(`./${new Date().toISOString()}error-group.json`, JSON.stringify(errorGroups))