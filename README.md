# gundb-gbase
gundb-gbase is a plugin for Gun(^0.9.x) using `Gun.chain`.

Used to make an 'Airtable' like app.

The table names, column names, row id's are all aliased inside of GBase to allow renaming of columns but not having to deal with keeping track of the data.

The row ID will be the value in the lefthand most column. It has to be unique but can be shortened or made sequentially or concatenated from other columns on the table (derived).

This has a few API's that make it easier to use in react to build dynamic tables and pages, but this module is mostly focused around building a simple table creation and query API and can be used with any front end you would like.

[API Docs](#api-docs)


# Example Usage

## Loading gun instance in to gbase
```
import Gun from 'gun/gun';
import {gbase} from 'gundb-gbase'

let opt = {}
opt.peers = ["http://localhost:8080/gun"]
let gun = Gun(opt);
gun.gbase(gun) //loads gun instance into GBase
```
## Creating a new Base
```
gbase.newBase('Base Name', 'First Table Name', 'Key Column Name on First Table', baseID)
```
There is an optional 4th argument which will be the Base ID. This should be sufficiently unique as a collision on the graph would merge Bases. If nothing is passed in a `'B' + Random 12 digit alpha numeric` will be generated. The return value from the above command will be the Base ID string.

## gbase chain
This is slightly different than the gun.chain api, but the general point is the same. The chain commands change as you traverse the api, for example:
```
//using gbase identifiers
gbase.base('B123456abcdef').table('t0').row('B123456abcdef/t0/r123abc').subscribe(data => console.log(data))
//logs:  ['DataPoint 123', 'some string', true, 3]

//using the aliases the user specified
gbase.base('Cool Database').table('Awesome Table').row('DataPoint 123').subscribe(data => console.log(data))
//logs:['DataPoint 123', 'some string', true, 3]


```
## Changing configurations
### Change Base/Table/Column Name
.config(Obj) will change the configuration settings of the current chain head.
```
gbase.base(BaseID).config({alias: 'New Name'})//Base Name
gbase.base(BaseID).table(tval).config({alias: 'New Table Name'})//Table Name
gbase.base(BaseID).table(tval).column(pval).config({alias: 'New Column Name'})//Table Name
```
### Other Config Options
.config(Object) can contain the following keys to change:
```
baseParams & tableParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false}

columnParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false, required: false, default: null}//default would be a default value if value was not given on new row creation.
```
## Adding Tables/Columns/Rows
The same chaining concepts apply from above:
```
gbase.base(BaseID).newTable('New Table Name', 'Key Column Name')
gbase.base(BaseID).table('Table Name').newColumn('New Column Name')


gbase.base(BaseID).table('Table Name').newRow('DataPoint 123', {p1: 'some string', p2: true, p3: 3}})//Human ID (first arg) must be unique, but can be human readable as it is aliased within GBase. 2nd Arg is optional to create the row, it is the data for all the other columns in the table.
```
## Importing Data
Currently have an API for .tsv files, not .csv (having a parsing problem with commas on google sheets export)
```
gbase.base(BaseID).importNewTable(tsvFileAsText, 'Table Name');
//creates a new table with alias: 'Table Name'
```
importNewTable will create a new table.
importData will import data to an existing table:
```
gbase.base(BaseID).table('Table').importData(tsvFileAsText, ovrwrt, append)
```
ovrwrt & append are booleans. If you only want to update matching rows (matches by first column, and header names) then ovrwrt = true and append = false. Outcomes for other value combinations are left for the reader to ponder.

## Linking Columns and Rows
### Column Config and initial conversion
GBase will try to find and match plain text comma serperated column values with the row alias on the linking sheet specified. If you also convert a link column to string, it will find all row alias names, and store those as comma seperated string. (splits and joins using ', ')
```
//change column to links, no back link column specified (gbase will create a new column on 'Other Table')
gbase.base(BaseID).table('Table Name').column('Column Name').linkColumnTo(gbase.base(BaseID).table('Other Table'))

//back link column specified (gbase will overwrite all data in 'Back Links' column)
gbase.base(BaseID).table('Table Name').column('Column Name').linkColumnTo(gbase.base(BaseID).table('Other Table').column('Back Links'))

//You can't link columns through the `config` API any longer.

```
To change it to string simply:
```
gbase.base(BaseID).table('Table Name').column('Column Name').config({GBtype: 'string'})
//This will automatically change the other back reference column to a string as well
```
### Linking Rows to other entries
You must already have the column converted to a link in order to link rows.
```
gbase.base(BaseID).table('Table Name').row('Specific Row').linkRowTo('Column', gbase.base(BaseID).table('Other Table').row('Some Row'))

//first argument in LinkRowTo is expecting either a column name or the 'p' value for the column that is a link column for what you are trying to link. Must specify in case there are more tha one 'prev' columns on that calling row.
```
Unlinking rows is basically the same call:
```
gbase.base(BaseID).table('Table Name').row('Specific Row').unlinkRow('Column', gbase.base(BaseID).table('Other Table').row('Some Row'))
```
Note: If the column is specifed in the config as `{linkMultiple: false}` then `.linkRowTo()` will throw an error if you attempt to link more than one entry to that column at a time.

## Functions and derived data
GBase supports functions that can pull data from one layer down (or above) and do math and put the result in the column specified with the function.
```
let BaseID = b123
let userFN = 'SUM({b123/t3/p2},{b123/t3/p4}) * {b123/t3/p6.b123/t5/p1}'
gbase.base(BaseID).table('t3').column('p5').config({GBtype: 'function', fn: userFN})

let b123/t3/r8 = {p0: 'Row 8', p2: 2, p4: 2 p6:[b123/t5/r13]}
let b123/t5/r13 = {p0: 'Row 13', p1:3}

userFN would resolve to:
SUM(2,2) * 3
4 * 3
= 12
*note how functions are resolved before normal order of operations.

Could also be written:
let userFN = '{b123/t3/p2} + {b123/t3/p4} * {b123/t3/p6.b123/t5/p1}'
userFN would resolve to:
2 + 2 * 3
2 + 6
= 8
```
All references must be wrapped in curly braces. The references must be in the format: '{' + baseID + '/' + tValue + '/' + pValue + '}'
If you are referencing a value on another table, seperate the '/' seperated address with a '.' so: {ref1.ref2} reference 1 must be a link column on your current table, ref2 must be a column that will resolve to a value (or another function column, it cannot be another link).

If your referenced column is a `{linkMultiple: true}` column, you MUST wrap the curly braces in a summary function. Current valid functions are: SUM, MULTIPLY, MAX, MIN, AVG, AND, OR, COUNT, COUNTALL, JOIN
JOIN is the only function that takes one argument before the reference, the seperator. Like:
```
'JOIN("-",{b123/t3/p6.b123/t5/p1})'
//note: whitespace is only preserved if it is within quotes " "
```
Functions are completed in this order:  
* {} references are resolved to values
* FN() are resolved next, if there is nested functions, each argument will be resolved before the outer FN computes
* Remaining math is completed (this is skipped if result contains invalid math characters)


# React Specific API's
## Load Config to React State
```
import Gun from 'gun/gun';
import {gbase, loadGBaseConfig, buildRoutes } from 'gundb-gbase'

class App extends Component {
  constructor() {
  super();
    let opt = {}
    opt.peers = ["http://localhost:8080/gun"]
    this.gun = Gun(opt);
    this.gun.gbase(this.gun) //loads gun instance into GBase
    window.gun = this.gun;
    window.gbase = gbase; //gbase chain api
    this.state = {
      routes: []
    }
  }
  componentDidMount(){
    let self = this
    loadGBaseConfig(self, self.state.currentBase);//fires setState on config changes
  }

  componentDidUpdate(prevProps, prevState) {
    let self = this
    buildRoutes(self, self.state.currentBase);
  }
  ```
### Building tables
toState, plays well with 'react-virtualized'
```
//dynamicMultiGrid.jsx

import { tableToState } from 'gundb-gbase'

componentDidMount() {
    let self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let alias = this.props.match.params.alias;
    let tval = GB.byAlias[baseID].props[alias].alias;

    gbase.base(baseID).table(tval).toState(self);
    //array of [rowID,[columnValArr]] in this.state.vTable

  }
componentDidUpdate(prevProps, prevState) {
    let self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let alias = this.props.match.params.alias;
    let tval = GB.byAlias[baseID].props[alias].alias;
    
    gbase.base(baseID).table(tval).toState(self);
    //array of [rowID,[columnValArr]] in this.state.vTable
}
```
### Row Detail
```
//rowDetail.jsx

import {rowToState} from 'gundb-gbase'

componentDidMount() {
    let self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let alias = this.props.match.params.alias;
    let tval = GB.byAlias[baseID].props[alias].alias;

    gbase.base(baseID).table(tval).row(rowID).toState(self);
    //array of [columnValArr] in this.state.row

  }
componentDidUpdate(prevProps, prevState) {
    const self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let curTable = this.props.match.params.alias;
    let curHID = this.props.match.params.hid;
    let rowID = GB.byAlias[baseID].props[curTable].rows[curHID]

    gbase.base(baseID).table(tval).row(rowID).toState(self);
    //array of [columnValArr] in this.state.row
}
```
### React Helper Functions
GBase has several helper functions for the ui.



#### Links
```
//in your link config component
import {linkOptions} from 'gundb-gbase'


//You only need to know the baseID and the table tVal to determine what other tables/columns you can link to

this.setState({opts: linkOptions(baseID,tval)})

//opts will be:
{t0:{
  alias: 'T Name',
  tval: t0,
  columns: [{alias: 'Column Name', pval: p3, path: "B123/t0/p3"}, ...]
  },....
}

{[baseID + '/' + tVal]: [p1,p3]}//array of valid columns that could be backLinkCols
NOTE: ALL data in the valid pVals listed will be overwritten, this API does not tell you which matches, only which ones COULD be used
```
#### Functions
```
//in your function config component
import {fnOptions, fnHelp} from 'gundb-gbase'


//You only need to know the baseID and the table tVal to determine what other tables/columns you can use in your a fn.

this.setState({opts: fnOptions(B123,t0)})

//opts will be:
{t0:{//non link column on this table
  alias: 'T Name',
  tval: t0,
  columns: [{alias: 'Column Name', pval: p3, path: "B123/t0/p3"}]
  },
  t2:{
  alias: 'Other Name',
  tval: t1,
  columns: [{alias: 'Column Name 2', pval: p4, path: "B123/t0/p7.B123/t1/p4"}]
  }
}

fnHelp(SUM) => [first element will be describing the aruments for that function, second element is an array of example usages]
//['value 1, value 2, ...value n', ['SUM(1,1,2) => 4', 'SUM(-2,1,1) => 0' ]]
```



// WIP VVVVVVVVV
____________________________________________

## **Key Concepts**
There are 2 types of properties in a node object (according to this module).
* Root Keys - Things with regular types (number, string, boolean, etc.)
* Structure Keys - Things with links to nodes that help define this node
### Root Keys
We also refer to a node containing *only* root keys a *root node*.
### Structure Keys
Structure keys are things that this module follows to build the tree or do the 'open'. Users will define a column as a link and select the table to which the link can find the Human ID. This will be defining the 'prev' link. A 'next' link will automatically generate a new 
##### prev and next ??
These are terms from linked lists. 'next' is going to move you away from root data nodes, 'prev' will move you toward root data nodes. A tree starts with roots (speaking literally), so it cannot have a previous link. Sorry if this is backwards from how you think of 'prev' and 'next' in a linked list, but this is the terms and definitions this module follows. The limitation here is that you can only ever have a single 'next' key.
* Think of 'prev' as things you must follow to resolve your current node (because it is made up of more info!!)
* Think of 'next' as a (singular) list of nodes where you can find a 'prev' link pointing back to this exact node.

**/Key Conepts**



# **API Docs**
### GBase Chain API
Basic APIs
* [base](#base)
* [table](#table)
* [row](#row)
* [column](#column)
* [newTable](#newTable)
* [newColumn](#newColumn)
* [newBase](#newBase)
* [newTable](#newTable)
* [newColumn](#newColumn)
* [newRow](#newRow)
* [edit](#edit)
* [subscribe](#subscribe)
* [retrieve](#retrieve)
* [clearColumn](#clearColumn)

Config APIs
* [config](#config)
* [linkColumnTo](#linkColumnTo)
* [linkRowTo](#linkRowTo)
* [unlinkRow](#unlinkRow)

Import APIs
* [importNewTable](#importNewTable)
* [importData](#importData)

Non-chain helper APIs

formatQueryResult





### Gun.Chain API
Only a single function is attached to the gun chain. It is used to load your gun instance in to GBase:
```
gun.gbase(gun)
```
## **gbase Chain -Basic APIs-**

________
### gbase
**gbase**  
This is the chain origination
Example usage:
```
gbase
```
chain options:
[.base()](#base)
[.newBase()](#newBase)
[.item()](#item)
[.config()](#config)
________
### base
**base(*baseName*)**  
All arguments are optional. Defaults are:  
`baseName = 'Base Alias' || 'baseID`

Example usage:
```
gbase.base('ACME Inc.')
```
chain options:
[.table()](#table)
[.newStaticTable()](#newStaticTable)
[.newInteractionTable()](#newInteractionTable)
[.importNewTable()](#importNewTable)
[.config()](#config)

________
### table
**table(*tableName*)**  
All arguments are optional. Defaults are:  
`tableName = 'Table Alias' || 'tval'` (ie; 't0' or 't3')

Example usage:
```
gbase.base('ACME Inc.').table('Customers')

```
chain options for **all** table types:
[.row()](#row)
[.column()](#column)
[.newRow()](#newRow)
[.newColumn()](#newColumn)
[.importData()](#importData)
[.subscribe()](#subscribe)
[.retrieve()](#retrieve)
[.associateTables()](#associateTables)
[.config()](#config)
chain options for **'interaction'** table types that are transactional (plus all from above):
[.listItems()](#listItems)
________
### column
**column(*columnName*)**  
All arguments are optional. Defaults are:  
`columnName = 'Table Alias' || 'tval'` (ie; 't0' or 't3')

Example usage:
```
gbase.base('ACME Inc.').table('Customers').column('First Name')

```
chain options for **all** table types:
[.row()](#row)
[.column()](#column)
[.newRow()](#newRow)
chain options for **'Static'** table types with column type of `'string'` or `'number'`:
[.linkColumnTo()](#linkColumnTo)

base,table,colum,row



### newBase
**newBase(*baseName*, *tableName*, *firstColumnName*, *baseID*)**  
All arguments are optional. Defaults are:  
`baseName = 'New Base'`  
`tableName = 'New Table'`  
`firstColumnName = 'New Column'`  
`baseID = 'B' + Gun.text.random(8)`//'B' + Random 8 Digit alphanumeric

Example usage:
```
gbase.newBase('ACME Inc.','Customers','Customer ID', "B123")
//returns: baseID

```
_________
### newTable
**newTable(*tableName*, *firstColumnName*)**  
All arguments are optional. Defaults are:  
`tableName = 'New Table'`  
`firstColumnName = 'New Column'`  
Note: An error will be thrown if the tableName is not unique for the base.
Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123"
gbase.base('ACME Inc.').newTable('Items','Part Number')
gbase.B123.newTable('Items','Part Number')
//returns: new table's tval || error object
//these two call are the same.
```
[baseID, tval? Read here](#gbase-vocab)
_________
### newColumn
**newColumn(*firstColumnName*, *type*)**  
All arguments are optional. Defaults are:  
`firstColumnName = 'New Column'`   
`type = 'string'`
Note: An error will be thrown if the firstColumnName is not unique for the base.
Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123" and "Items" = "t0"
gbase.base('ACME Inc.').table('Items').newColumn('Vendor')
gbase.B123.t0.newColumn('Vendor')
//returns: new columns's pval || error object
//these two call are the same.
```
[baseID, t0, pval? Read here](#gbase-vocab)
_________
### newRow
**newRow(*\*rowAlias*, *dataObj*, *cb*)**  
rowAlias is required, others are optional   
`dataObj = {Column Alias || pval: value} `  
`cb = Function(err, value)`  
Note: An empty row will be created if only the rowAlias is supplied
Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123" and "Items" = "t0"
gbase.base('ACME Inc.').table('Items').newRow('8522761755')
gbase.B123.t0.newRow('8522761755')
--With Data--
//assume column 'Vendor' = 'p1'
gbase.base('ACME Inc.').table('Items').newRow('8522761755',{Vendor: 'Supply Store'})
gbase.B123.t0.newRow('8522761755',{Vendor: 'Supply Store'})
gbase.B123.t0.newRow('8522761755',{p1: 'Supply Store'})
//all the same call
--With Data and CB--
gbase.B123.t0.newRow('8522761755',{p1: 'Supply Store'}, (err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value will return the new row's rowID
  }
})
```
[rowID, rowAlias? Read here](#gbase-vocab)

_________
### edit
**edit(*\*dataObj*, *cb*)**  
dataObj is required, others are optional   
`dataObj = {Column Alias || pval: value} `  
`cb = Function(err, value)`  
Note: If you try to edit a function or link column, those values will be stripped out of your dataObj before putting data in to the database.
Example usage:
```
//assume:
'ACME Inc.'= "B123"
'Items' = 't0'
'Vendor' = 'p1'
'8522761755' = 'B123/t0/r123'

gbase.base('ACME Inc.').table('Items').row('8522761755').edit({p1: 'Anvils 'r Us'})
gbase.B123.t0['B123/t0/r123'].edit({p1: 'Anvils 'r Us'})
gbase.base('ACME Inc.').table('Items').row('8522761755').edit({'Vendor': 'Anvils 'r Us'})
gbase.B123.t0['B123/t0/r123'].edit({'Vendor': 'Anvils 'r Us'})
//all the same call

--With Data and CB--
gbase.base('ACME Inc.').table('Items').row('8522761755').edit({'Vendor': 'Anvils 'r Us'}, (err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value will return truthy if successful
  }
})
```
[t0, p1? Read here to understand the terminology used.](#gbase-vocab)
_________
### subscribe
**subscribe(*\*callBack*, *colArr*, *queryArr*, *udSubID*)**  
callBack is required, others are optional Defaults:  
`callBack = Function(data, colArr) `  
`colArr = Default is all columns that are !archived && !deleted, in the order in the config`  
`queryArr = [{SEARCH: ['abc']},{FILTER: ['{p3} > 3']}]` [More Info on query here](#query)    
`udSubID = undefined // will create an ID`  

Subscribe will fire the callback with the **entire** data set that matches that query on every change.

* **data** - structured like: `[[rowID, [colArr[0] data, colArr[1] data]]]`   
`data[0] = [rowID, [propArr]]`  
`data[0][1] = [value1, value2, value3]`  
The index of the value in the **propArr** corresponds to the index in **colArr** to what pval that value belongs to.
* **colArr** - an array of pval's. The order you give is the same order the **data** is returned in. If you do not give a **colArr** the **callBack** will return the columns in the order that matches **data**.


The *`udSubID`* (user-defined Subscription ID) was added to allow you to fire the `subscribe()` code itself multiple times without setting up multiple subscriptions. If you specify the same subID twice with two different `callBacks`, then the last fired `subscribe()` callBack will be the only callBack that fires (old callBack is replaced). This is used in the React API's to allow a single component to setup multiple subscriptions, and 'watch' the correct subscriptions when a different 'table' is loaded. `toState` (see [React API](#react-specific-api's)) is a wrapper on `subscribe()`.

Data loading and the callBack: Depending on the state of the database and how much data is already loaded the callBack will fire immediately if it has all the data in memory.

Example usage:
```
//assume:
'ACME Inc.'= "B123"
'Items' = 't0'
'Vendor' = 'p1'
'Weight' = 'p2'
'8522761755' = 'B123/t0/r123'

--Row Subsciption--
gbase.base('ACME Inc.').table('Items').row('8522761755').subscribe(function(data){
  //data = ["Anvils 'r Us", 10]
},['p1','p2'])

--Table Subscription--
gbase.base('ACME Inc.').table('Items').subscribe(function(data, colArr){
  //colArr = ['p0','p1','p2']
  //data = [['B123/t0/r123': ['8522761755','Anvils 'r Us',10]],...]
})


--Table Subscription w/colArr & error handling--
//works the same for a row subscription
let err = gbase.base('ACME Inc.').table('Items').subscribe(function(data){
  //data = {'B123/t0/r123': {p1: 'Anvils 'r Us', p2: 10}}
}, ['p1','p2'])

if(err){
  //handle Error
}


Note: The chain function call will return undefined || error if it failed to setup the subscription.
```
[Read here to understand the terminology used.](#gbase-vocab)

_________
### retrieve
**retrieve(*\*callBack*, *colArr*, *queryArr*)**  
This is the same as [subscribe()](#subscribe) except that it only fires the callback one time with the data.


## **gbase Chain -Config APIs-**
________
### config
**config(*\*configObj*, *backLinkCol*, *cb*)**  
configObj is required. 

configObj: Base
```
//valid keys
```
configObj: Table
```
//valid keys
```
configObj: Column
```
//valid keys
```

Example usage:
```


```
_________




## GBase Helper Functions
_________
### formatQueryResults
**formatQueryResults(*\*queryResult*, *\*colArr*, *\*queryArr*)**  
All arguments are required
* **queryResult** - This is the data array returned to the `subscribe()` and `retrieve()` callBack.
* **colArr** - This is the *colArr* (2nd argument) also returned from the `subscribe()` and `retrieve()` callBack.
* **queryArr** - This is the same *queryArr* passed in to the `subscribe()` and `retrieve()` API. This can have any sort of arguments in it, this API will ignore everything except **SORT** and **GROUP**.

For more info see the [Query](#query) section.

# Query
`subscribe()` and `.retrieve()` called on a **table** accepts an `array` of query argument `objects`. Below are how they work:
_________
### RANGE
**{RANGE: [*index*, *from*, *to*, *relativeTime*,*toDate*,*lastRange*,*firstDayOfWeek*]}**  
All arguments are optional, however if some are specified others cannot be:
* if you specifiy `relativeTime`, `toDate`, or `lastRange` you cannot specify a `from` or `to`

Explanation of arguments:
* **index** - What time index to use for the query, metadata indices are 'created' and 'edited'. Normally you would specify a pval column as an argument: `baseID/tval/pval` for 'created' (edited is the same format): `baseID/tval/'created'`. If specifying a column, that column must be `{GBtype: 'date'}`
* **from** - This can be an `instanceof Date` or anything that `new Date()` can construct a date object with. For example a unix time or properly formatted date string.
* **to** - same as **from**
* **relativeTime** - if specified it will derive **from** by `Date.now()`. **to** will be set to `Infinity` so new items will still match this query. This argument is formatted as follows: `Number()` + flag. Valid flags are:
```
y = year (Number() * 365 days)
m = month (Number() * 30 days?) not fixed length...
w = week (Number() * 7days)
d = day (Number() of days)
h = hours (Number() of hours)
examples: 
50d would set `from` -50 days
10w would set `from` -70 days
```
* **toDate** - For example 'Year to Date' would be an argument  = 'year'. It would set **from** to Jan 1 of the current year. This argument has the following valid options:
```
'year'
'month'
'week'
'day'
```
* **lastRange** - This is a preset for relative previous time chunks. For example if this is set to 'month', **from** and **to** will be set to the first millisecond in the previous month, and the last millisecond in the previous month. This has the same valid options as **toDate** with the addition of `'quarter'` 
* **firstDayOfWeek** - This is used for the **toDate** and **lastRange** `week` argument. `0` is default and represents Sunday.

_________
### LIMIT
**{LIMIT: [*number*]}**  
**number** Integer for number of items.
NOTE: This will limit the result count. Query starts based on your RANGE parameters (from, to, direction) and returns matching items when limit is met.

_________
### SEARCH
**{SEARCH: [*searchString*]}**  
searchString is a string that will be checked against all (!archived && !deleted) columns on the rows returned from **RANGE**. This does a regEx `test` on `String(columnValue)`

_________
### FILTER
**{FILTER: [*fnString*]}**  
`fnString` is a string that will be evaluated against the row specified in the `fnString` It is looking for a true or false return and uses the same logic as the first argument in the `IF()` statement, see [Functions](#functions) for more detail. The only difference is that the reference to the column is simply the pval in brackets: `{p3}`. If you would like to filter on more than one column, then add another **FILTER** object to the query array.  
An example on how to filter column 'p3' on a value '3': `'{p3} = 3'`. If you are filtering using a number you can use the following comparators: <, >, =, !=, <=, >=. If you are trying to exact match a string, then you can only use: =, !=

## Formatting Queries
These are to be used in the helper function provided: [formatQueryResults()](#formatQueryResults)
_________
### SORT
**{SORT: [*column*,*direction*]}**  
**column** is a pval that contains the values to sort by.  
**direction** is either `asc` or `dsc`  
If you would like to sort by a second or third column or n columns, just add more **SORT** objects to the query array. They are applied in the order in the query array, so be sure to put the order in correctly if multiple sort columns.

_________
### GROUP
**{GROUP: [*column*]}**  
**column** is a pval that contains the values to group by.  
NOTE: if you include a a **GROUP** to any formatting query it will change the form of the output return value. Instead of the result format from the `subscribe()` or `retrieve()`, this will return an object with keys of the grouped by value and the value for that key will be in the format from `subscribe()` or `retrieve()` return.




# GBase Vocab
GBase has many concepts that are referenced in the docs. Here are some definitions:
* **baseID**: The uuid/identifier of the base
* **tval**: The GBase internal identifier for the table. For the first table create it is `t0`, second table created is `t1`, and so on.
* **pval**: same as tval, except for the columns (table **p**roperties).
* **rowID**: like t or pval, except for the row. rowID will have the complete path of it's location: `"B123/t0/r123"`. Rows are basically an instance of the table.
* **rowAlias**: This is the human name for the rowID (just like how rows and columns are aliased). For example if you had a table called 'Items' and it's key column (`p0`) is labeled 'SKU' then: `"B123/t0/r123" = "8522761755"
* **path**: path is basically like the rowID, but can be applied at any level. For a table: `"B123/t0"`. For a column: `"B123/t0/p0"`. If you wanted to specify a specify column/property on a row: `"B123/t0/r123/p3"`. << This is not really used in the gbase.chain API. Might be used for imported non-chain helper functions.
* **prev**: This is part of how the linking is conceptualized. `"prev"` (short for 'previous') is basically a link to more data that you MUST follow to resolve the current row (object) you are viewing. GBase linking API does not handle 'many to many' relationships as 'links'. 'many to many' can be done through the tagging or a 'transactional' table API's.
* **next**: Opposite of 'prev'. This is stored on each row, and contains all items that depend on this item to resolve. So for functions, if a change happens on something that has a next, it will have to go 'up' a level and update any dependent data that was changed below (and so on up through the links until there are changes that are effecting values 'above' it.)

### FAQs
Will fill this out as I receive feedback.


# Credit
* Would like to thank @amark for building [GunDB](https://gun.eco/docs/Introduction). Very cool project and a new way to interact with data. Excited to see this project grow with the future development with AXE and the other ecosystem products he is working on.
* Everyone on the [GunDB Gitter](https://gitter.im/amark/gun) who helped answer my questions!