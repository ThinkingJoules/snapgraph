const {setMergeValue, getValue, setValue, gbByAlias,gbForUI,findRowAlias, linkColPvals,formatQueryResults} = require('../gbase_core/util')
const maketableToState = (gb, vTable, subscribeQuery) => (path) => (thisReact, colArr, queryArr)=>{
    let [base,tval] = path.split('/')
    let subID = path+'toState'
    queryArr = queryArr || []
    let oldData = getValue([base,tval,'last'], vTable)
    let flaggedCols = linkColIdxs(gb,base,tval)
    if(thisReact.state && thisReact.state.vTable && oldData !== undefined && JSON.stringify(oldData) !== JSON.stringify(thisReact.state.vTable)){
        thisReact.setState({vTable: oldData, linkColumns: flaggedCols})
        return
    }
    let call = subscribeQuery(path)
    call(function(data, colArr){
        console.log(data)
        let flaggedCols = linkColIdxs(gb,base,tval)
        let links = linkColPvals(gb,base,tval)
        let headerValues = generateHeaderRow(gb, base, tval)
        let newTable = [['headers', headerValues]]
        let output = formatQueryResults(data,queryArr,colArr)
        newTable = newTable.concat(output)
        if(thisReact.state && JSON.stringify(getValue([base,tval,'last'],vTable)) !== JSON.stringify(newTable) || !thisReact.state.linkColumns || JSON.stringify(thisReact.state.linkColumns) !== JSON.stringify(flaggedCols)){
            setValue([base, tval, 'last'], newTable, vTable)
            thisReact.setState({vTable: newTable,linkColumns: flaggedCols})
        }
        
    }, colArr, queryArr, subID)
}
const makerowToState = (gb,vTable, subscribe) => (rowID, thisReact)=>{
    let [base, tval, rval] = rowID.split('/')
    let oldData = getValue([base,tval,rowID], vTable)
    if(oldData !== undefined){
        let links = linkColPvals(gb,base,tval)
        let [headers, headerValues] = generateHeaderRow(gb, base, tval)
        let oldRow = [headerValues]
        let rowArr = xformRowObjToArr(oldData, headers,links)
        oldRow.push(rowArr)
        if(thisReact.state && thisReact.state.rowObj && oldData !== undefined && JSON.stringify(oldData) !== JSON.stringify(thisReact.state.rowObj)){
            thisReact.setState({vRow: newRow})
            for (const pval in oldData) {
                const value = oldData[pval];
                thisReact.setState({[pval]: value})
            }
            return
        }

    }
    let _path = rowID
    let subID = base + '+' + tval + '+' + rval
    let call = subscribe(_path)
    call(function(data){
        let links = linkColPvals(base,tval)
        let [headers, headerValues] = generateHeaderRow(gb, base, tval)
        let newRow = [headerValues]
        let rowObj
        for (const rowid in data) {// put data in
            rowObj = data[rowid];
            setMergeValue([base,tval,rowid],rowObj,vTable)
        }
        let rowArr = xformRowObjToArr(gb,rowObj, headers, links)
        newRow.push(rowArr)
        let rowValue = getValue([base,tval,rowID], vTable)
        if(!thisReact.state.vRow || thisReact.state.vRow && rowValue && JSON.stringify(rowValue) !== JSON.stringify(thisReact.state.vRow)){
            thisReact.setState({vRow: newRow})
            for (const pval in rowValue) {
                if(links[pval]){//value is link
                    let cellValue = []
                    let linksObj
                    try{
                        linksObj = JSON.parse(rowObj[pval])
                    }catch (err){
                        rowArr.push(rowObj[pval])
                    }
                    for (const linkRowID in linksObj) {
                        const value = linksObj[linkRowID];
                        if (value) {
                            cellValue.push(findRowAlias(linkRowID))
                        }
                    }
                    thisReact.setState({[pval]: cellValue})
    
                }else{
                    const value = rowValue[pval];
                    thisReact.setState({[pval]: value})
                }
                
            }
        }
        
    }, undefined, true, true, subID)
}
const makebuildRoutes = gb =>(thisReact, baseID)=>{
    let result = []
    let byAlias = gbByAlias(gb)
    let forUI = gbForUI(gb)
    if(byAlias === undefined || forUI[baseID] === undefined){return}
    let tables = Object.values(forUI[baseID])
    for (let i = 0; i < tables.length; i++) {
        let tableObj = {}
        const table = tables[i];
        let tval = Object.keys(table)[0]
        tableObj.alias = gb[baseID].props[tval].alias
        tableObj.base = baseID
        tableObj.key = tval
        tableObj.cols = []
        tableObj.colalias = {}
        tableObj.rowHID = []
        if(gb[baseID].props[tval].rows){
            for (const HID in byAlias[baseID].props[tableObj.alias].rows) {
                const GBID = byAlias[baseID].props[tableObj.alias].rows[HID];
                if (GBID) {
                    tableObj.rowHID.push({[HID]: GBID})
                }
            }
        }
        result.push(tableObj)
        let columns = Object.values(table[tval])
        for (let j = 0; j < columns.length; j++) {
            const pval = columns[j];
            let palias = gb[baseID].props[tval].props[pval].alias
            tableObj.colalias[pval] = palias
            result[i].cols.push(pval)
        }
    }
    if(!thisReact.state.GBroutes || JSON.stringify(thisReact.state.GBroutes) !== JSON.stringify(result)){
        thisReact.setState({GBroutes: result})
    }
}
const generateHeaderRow = (gb, base, tval, colArr)=>{
    let columns = getValue([base, 'props', tval, 'props'], gb)
    let headerValues = []
    for (const pval of colArr) {
        let {alias} = columns[pval]
        headerValues.push(alias)
    }
    return headerValues

}
const xformRowObjToArr = (gb, rowObj, orderedHeader, linkColPvals)=>{
    let rowArr = []
    for (let j = 0; j < orderedHeader.length; j++) {
        const pval = orderedHeader[j];
        if(rowObj[pval]){
            if(linkColPvals[pval]){//value is link
                let cellValue = []
                for (let i = 0; i < rowObj[pval].length; i++) {
                    const link = rowObj[pval][i];
                    cellValue.push(findRowAlias(gb,link))
                }
                rowArr.push(cellValue)

            }else{//value is data
                rowArr.push(rowObj[pval])
            }
        }else{
            rowArr.push('')
        }
    }
    return rowArr
}
const linkColIdxs = (gb, base, tval)=>{
    let headers = generateHeaderRow(gb,base,tval)[0]
    let links = linkColPvals(gb,base,tval)
    let flaggedCols = []
    for (let i = 0; i < headers.length; i++) {
        const pval = headers[i];
        if(links[pval]){
            flaggedCols.push(i)
        }
    }
    return flaggedCols
}
const makelinkOptions = gb => (base,tval) =>{
    let ts = {}
    for (const t in gb[base].props) {
        if(t !== tval){
            const {alias, props} = gb[base].props[t];
            let valid = true
            let validCols = []
            for (const p in props) {
                const {alias, GBtype} = props[p];
                let path = [base,t,p].join('/')
                let colObj = {alias,path}
                if (GBtype === 'next') {
                    valid = false
                    break
                }else if(GBtype === 'string'|| GBtype === 'number'){
                    colObj.pval = p
                    validCols.push(colObj)
                }
            }
            if(valid){
                ts[t] = {alias,tval:t,columns: validCols}
            }
        }
    }
    return ts
}
const makefnOptions = gb => (base,tval) =>{
    let ts = {}
    const {alias, props} = gb[base].props[tval]
    let talias = alias
    for (const p in props) {
        let path =[base,tval,p].join('/')
        const {alias, GBtype,linksTo} = props[p]
        if (['prev','next'].includes(GBtype)){
            let [lb,lt,lp] = linksTo.split('/')
            let ltps = gb[lb].props[lt]
            for (const ltp in ltps.props) {
                const {alias, GBtype} = ltps.props[ltp];
                let subPath = [lb,lt,ltp].join('/')
                let dotPath = [path, subPath].join('.')
                if (['function','string','number','boolean'].includes(GBtype)) {
                    if(typeof ts[lt] !== 'object'){
                        ts[lt] = {alias: ltps.alias, tval:lt, columns: []}
                    }
                    ts[lt].columns.push({alias, path:dotPath,pval:ltp})  
                }
            }
        }else if(['function','string','number','boolean'].includes(GBtype)){
            if(typeof ts[tval] !== 'object'){
                ts[tval] = {alias: talias, tval:tval, columns: []}
            }
            ts[tval].columns.push({alias,path,pval:p})
        }
    }
    return ts
}
module.exports = {
    maketableToState,
    makerowToState,
    makebuildRoutes,
    generateHeaderRow,
    xformRowObjToArr,
    linkColIdxs,
    makelinkOptions,
    makefnOptions
}