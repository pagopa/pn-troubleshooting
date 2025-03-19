const fs = require('fs');

// ------------------------------------------------

const workdir = "/path/to"
const prPath = workdir + "/pn-configuration/test/_conf/core/system_params"

const filePrefix = [
    "radd-experimentation-zip-1##A##",
    "radd-experimentation-zip-2##A##",
    "radd-experimentation-zip-3##A##",
    "radd-experimentation-zip-4##A##",
    "radd-experimentation-zip-5##A##"
]

// ------------------------------------------------

console.log('\nLegenda:\nPR = Valori presenti nella PR e assenti nel Paramenter store')
console.log('ParamStore = Valori presenti nel Paramenter store e assenti nella PR\n')
console.log('Nome ParamStore | PR | ParamStore \n------------------------------')

for(const FILE of filePrefix){

    const paramData = fs.readFileSync('./' + FILE + '.json', 'utf8');
    const prData = fs.readFileSync(prPath + "/" + FILE +'.param', 'utf8');

    // compare paramData and prData, find elements in A and not in B and element in B and not in A

    const paramDataArray = JSON.parse(paramData);
    const prDataArray = JSON.parse(prData);

    const paramDataArraySet = new Set(paramDataArray);
    const prDataArraySet = new Set(prDataArray);

    let paramNotInPr = paramDataArray.filter((element) => !prDataArraySet.has(element));
    let prNotInParam = prDataArray.filter((element) => !paramDataArraySet.has(element));

    if(prNotInParam == "") prNotInParam = "X"
    if(paramNotInPr == "") paramNotInPr = "X"

    console.log(FILE + " | " + prNotInParam + " | " + paramNotInPr);

}
console.log('\nFine.\n')


