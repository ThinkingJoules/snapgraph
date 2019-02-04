function gunGet(gun, getString){
    return new Promise( (resolve, reject) => {
        let lookup = gun.get(getString).then()
        resolve(lookup)
    })
}

function gunGetGet(gun, getNode, getProp){
    return new Promise( (resolve, reject) => {
        let lookup = gun.get(getNode).get(getProp).then()
        resolve(lookup)
    })
}

function gunGetList(gun, setNode){

    return gunGet(gun, setNode).then(res => {
        return new Promise((resolve, reject) => { 
            let filtered = []
            for (const key in res) {
                const value = res[key];
                if (value !== null && key !== '_'){
                    filtered.push(key)
                }
            }
            resolve(filtered);
        });
    })
}
function gunGetListNodes(gun, setNode){

    return gunGetList(gun,setNode).then(refs =>{
        return Promise.all(refs.map(key =>{
            return gunGet(gun,key)
        }))
    })        
}
function gunFilteredNodes(gun, setNode, filterProp, exist){
    let nodes = gunGetListNodes(gun, setNode)
    return Promise.resolve(nodes).then(data =>{ 
            console.log(data)
            let filtered = []
            for (let i = 0; i < data.length; i++) {
                const node = data[i];
                if (exist){
                    if(node && node[filterProp] && (node[filterProp].length || typeof node[filterProp] === 'number')){
                        filtered.push(node)
                    }
                }else{
                    if(!node[filterProp] || node[filterProp].length == 0){
                        filtered.push(node)
                    }
                }
                
            }
            return filtered
        
    })
}

function gunGetListProp(gun, setNode, prop){

    return gunGetList(gun,setNode).then(refs =>{
        return Promise.all(refs.map(key =>{
            return gunGetGet(gun,key,prop)
        }))
    })        
}

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}
function nextIndex(object, value) {
    let max = 0
    for (const key in object) {
        let test = value + "\\d+"
        let re = new RegExp(test)
        let found = key.match(re)
        let prop = /p/i.test(found)
        if(found !== null && !prop){
            let idx = Number(found[0].slice(1))
            if(max < idx){
                max = idx
            }
        }else{
            let idx = Number(found[0].slice(found[0].lastIndexOf('p')+1))
            if(max < idx){
                max = idx
            } 
        }
    }
    max++
    let nextKey = value + max.toString()
    return nextKey
}
function hashCode(string) {
    var hash = 0;
    if (string.length == 0) {
        return hash;
    }
    for (var i = 0; i < string.length; i++) {
        var char = string.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}
module.exports = {
    gunGet,
    gunGetGet,
    gunGetList,
    getKeyByValue,
    gunGetListNodes,
    gunGetListProp,
    gunFilteredNodes,
    nextIndex,
    hashCode
}