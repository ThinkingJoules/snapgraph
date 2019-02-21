# gundb-gbase
gundb-gbase is a plugin for Gun(^0.9.x) using `Gun.chain`.

Used to make an 'Airtable' like app.

The table names, column names, row id's are all aliased inside of GBase to allow renaming of columns but not having to deal with keeping track of the data.

The row ID will be the value in the lefthand most column. It has to be unique but can be shortened or made sequentially or concatenated from other columns on the table (derived).

This has a few API's that make it easier to use in react to build dynamic tables and pages, but this module is mostly focused around building a simple table creation and query API and can be used with any front end you would like.


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
gbase['B123456abcdef']['t0']['B123456abcdef/t0/r123abc'].subscribe(data => console.log(data))
//logs:  {B123456abcdef/t0/r123abc:{p0: 'Human Row Name, p1: 'some string', p2: true, p3: 3}}

//using the aliases the user specified
gbase['Cool Database']['Awesome Table']['DataPoint 123'].subscribe(data => console.log(data))
//logs:  {B123456abcdef/t0/r123abc:{p0: 'Human Row Name, p1: 'some string', p2: true, p3: 3}}


```
## Changing configurations
### Change Base/Table/Column Name
.config(Obj) will change the configuration settings of the current chain head.
```
gbase[BaseID].config({alias: 'New Name'})//Base Name
gbase[BaseID][tval].config({alias: 'New Table Name'})//Table Name
gbase[BaseID][tval][pval].config({alias: 'New Column Name'})//Table Name
```
### Other Config Options
.config(Object) can contain the following keys to change:
```
baseParams & tableParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false}

columnParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false, required: false, default: false}//default would be a default value if value was not given on new row creation.
```
## Adding Tables/Columns/Rows
The same chaining concepts apply from above:
```
gbase[BaseID].newTable('New Table Name', 'Key Column Name')
gbase[BaseID]['Table Name'].newColumn('New Column Name')


gbase[BaseID]['Table Name'].newRow('DataPoint 123', {p1: 'some string', p2: true, p3: 3}})//Human ID (first arg) must be unique, but can be human readeable as it is aliased within GBase. 2nd Arg is optional to create the row, but is the for all other rows in table.
```
## Importing Data
Currently have an API for .tsv files, not .csv
```
gbase[baseID].importNewTable(tsvFileAsText, 'Name of Table);
//creates a new table with alias: 'Table Name'
```
importNewTable will create a new table.
importData will import data to an existing table:
```
gbase[baseID]['Table'].importData(tsvFileAsText, ovrwrt, append)
```
ovrwrt & append are booleans. If you only want to update matching rows (matches by first column, and header names) then ovrwrt = true and append = false. Outcomes for other value combinations are left for the reader to ponder.

## Linking Columns and Rows
### Column Config and initial conversion
GBase will try to find and match plain text comma serperated column values with the row alias on the linking sheet specified. If you also convert a link column to string, it will find all row alias names, and store those as comma seperated string. (splits and joins using ', ')
```
//change column to links, no back link column specified (gbase will create a new column on 'Other Table')
gbase[BaseID]['Table Name']['Column Name'].linkColumnTo(gbase[BaseID]['Other Table'])

//back link column specified (gbase will overwrite all data in 'Back Links' column)
gbase[BaseID]['Table Name']['Column Name'].linkColumnTo(gbase[BaseID]['Other Table']['Back Links'])

//You can also link columns through the config API, but it is not recommended.

```
To change it to string simply:
```
gbase[BaseID]['Table Name']['Column Name'].config({GBtype: 'string'})
//This will automatically change the other back reference column to a string as well
```
### Linking Rows to other entries
You must already have the column converted to a link in order to link rows.
```
gbase[BaseID]['Table Name']['Specific Row'].linkRowTo('Column', gbase[BaseID]['Other Table']['Some Row'])

//first argument in LinkRowTo is expecting either a column name (if you used human names in your gbase chain calls, also accepts 'p' value) or the 'p' value for the column that is a link column for what you are trying to link.
```
Unlinking rows is basically the same call:
```
gbase[BaseID]['Table Name']['Specific Row'].unlinkRow('Column', gbase[BaseID]['Other Table']['Some Row'])
```
Note: If the column is specifed in the config as `{linkMultiple: false}` then `.linkRowTo()` will throw an error if you attempt to link more than one entry to that column at a time.

## Functions and derived data
GBase supports functions that can pull data from one layer down and do math and put the result in the specified column.
```
let baseID = b123
let userFN = 'SUM({b123/t3/p2},{b123/t3/p4}) * {b123/t3/p6.b123/t5/p1}'
gbase[BaseID][t3][p5].config({GBtype: 'function', fn: userFN})

let b123/t3/r8 = {p0: 'Row 8', p2: 2, p4: 2 p6:[b123/t5/r13]}
let b123/t5/r13 = {p0: 'Row 13', p1:3}

userFN would resolve to:
SUM(2,2) * 3
4 * 3
= 12
*note how functions are resolved before normal order of operations.
```
All references must be wrapped in curly braces. The references must be in the format: '{' + baseID + '/' + tValue + '/' + pValue + '}'
If you are referencing a value on another table, seperate the '/' seperated address with a '.' so: {ref1.ref2} reference 1 must be a link column on your current table, ref2 must be a column that will resolve to a value (or another function column, it cannot be another link).

If your referenced column is a `{linkMultiple: true}` column, you MUST wrap the curly braces in a summary function. Current valid functions are: SUM, MAX, MIN, AVG, AND, OR, COUNT, COUNTALL, JOIN
JOIN is the only function that takes one argument before the reference, the seperator. Like:
```
'JOIN("-",{b123/t3/p6.b123/t5/p1})'
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
tableToState, plays well with 'react-virtualized'
```
//dynamicMultiGrid.jsx

import { tableToState } from 'gundb-gbase'

componentDidMount() {
    let self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let alias = this.props.match.params.alias;
    let tval = GB.byAlias[baseID].props[alias].alias;

    tableToState(baseID, tval, self);
    //2D array of [row][column] in this.state.vTable

  }
componentDidUpdate(prevProps, prevState) {
    let self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let alias = this.props.match.params.alias;
    let tval = GB.byAlias[baseID].props[alias].alias;
    
    tableToState(baseID, tval, self);
    //2D array of [row][column] in this.state.vTable
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

    tableToState(baseID, tval, self);
    //2D array of [row][column] in this.state.vTable

  }
componentDidUpdate(prevProps, prevState) {
    const self = this;
    let GB = this.props.config;
    let baseID = this.props.base;
    let curTable = this.props.match.params.alias;
    let curHID = this.props.match.params.hid;
    let rowID = GB.byAlias[baseID].props[curTable].rows[curHID]

    rowToState(rowID, self)
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



# API Docs
### Gun.Chain API



* **gun.archive()**
  

* **gun.unarchive()**
  
* **gun.delete()**
  

#

### FAQs
Will fill this out as I receive feedback.


# Credit
* Would like to thank @amark for building [GunDB](https://gun.eco/docs/Introduction). Very cool project and a new way to interact with data. Excited to see this project grow with the future development with AXE and the other ecosystem products he is working on.
* Everyone on the [GunDB Gitter](https://gitter.im/amark/gun) who helped answer my questions!