



const makenewQueryObj = (gsubs,gsubsParams,setupSubscription) => (cb,tPath, isSub ,colArr, qArr, userSubID)=>{
    /*
    tPath = base/tval
    subscribe = true || false // collect data from gun(retrieve) or look for cache(subscribe) and 'requestInitialData'>>cb sub will get rest
    colArr = ['p0','p1', etc...]
    qArr = [
        {RANGE: [index,from,to,Items,__ToDate,Last__,firstDayOfWeek]},
        {SEARCH: ['string']},
        {FILTER: ['function', pval(opt)]},
        {SORT: [pval, asc/dec]},
        {GROUP: [pval]}
    ]
    */
   //colArr is optional, if none specified, will return all !deleted && !archived columns
   //qArr optional, if none specified, range is ALL
   //if qArr, if RANGE: parseRange(), if FILTER: checkFunction(), ...rest: validate args
   let q = {
    table: tPath,
    subscribe: (isSub) ? true : false,
    columns: colArr || [],
    range: tRange, 
    userCB: cb || function(){},
    items: {},
    data: [], 
    query: queryArr,
    subID: userSubID || Gun.text.random(4),
    done: function(){
        if(this.subscribe){
            this.setupSubscription(this.subID,this.table,this.qParams, this.subID)
        }else{
            let output = this.applyQuery([this.items,this.data],this.qParams)
            this.userCB.call(this,output)
        }

    },
    next: nextFN,
    get qParams(){
        return {range: this.range, columns: this.columns, query: this.query, items: Object.values(this.items)}
    },
    applyQuery,
    setupSubscription

    }
   /*
   qObj needs:
   subscribe: true || false
   columns: ['p0','p1',..etc]
   range: [index, to, from] || false if ALL //could be SEARCH: * would also return all items
   done: cb || function(){}
   items = [] or maybe {0: rowID} //rowID collector for query?
   data = [[val1],[]] //?? could check doneness by comparing columns .length to data[i] and all items by object.values(items).length to data.length?

   */

   return q
}


//MAP OUT BOTH FLOWS, RETRIEVE AND SUBSCRIPTION
//Both are similar, I think they both use apply query, just a matter of how it is gathering the data
//queryObj is maybe only for retrieve and subscription follows different flow
//retrieve will ignore cache
//subscribe will setup subscription
//do subs need to know current items? I don't think so, it just runs the queryfilter on all new incoming data
//what about partials, if filter is for specific col, and a different col comes through yet is part of colArr, how would you know to pass it along?
//should it have a second buffer to limit callback firing too often? Yes I think so?
function parseQuery(cb,tPath, isSub ,colArr, qArr, userSubID){

}
const query = (gun, gb, path, colArr, queryObj) =>{
    let pathArgs = path.split('/')
    //findRowsForQuery (range)
    //get all Cols for range either by traversal, or by setting up sub and requesting initial
    //once all data is gathered, apply query

}
const makesetupSubscription = (requestQueryData) => (subID,gsubsParams, table, qParams)=>{
    if(typeof gsubsParams[table] !== 'object') gsubsParams[table] = {}
    gsubsParams[table][subID] = qParams
    requestQueryData(table,subID,qParams)
    //this would check get all filtered data it can from cache, and then new subs would go through handleNewCellData() in gun cb
}
function applyQuery(data, qParams){
    //called from retrieve after data is gathered OR
    //called when sifting through the buffer
    //can only run queries on a per table basis, all subscriptions are under a table, match buffer rowData to correct sub testing
    //sort through dataset based on params
    //assemble passing rows {[rowid]:{p0:'val1', etc..}}
    //return filtered 'table'
    //data = [{0:rowID}, [[val1,val2],[val1,val2]]
}

module.exports = {
    makenewQueryObj,
    makesetupSubscription,
    query
}