# gundb-gbase
gundb-gbase is a plugin for Gun(^0.9.x) using `Gun.chain`.

Used to make an 'Airtable' like app.

The table names, column names, row id's are all aliased inside of GBase to allow renaming of columns but not having to deal with keeping track of the data.

The row ID will be the value in the lefthand most column. It has to be unique but can be shortened or made sequentially or concatenated from other columns on the table (derived). The row ID will also be called Human ID or HID within these docs (and codebase).

This has a few API's that make it easier to use in react to build dynamic tables and pages, but this module is mostly focused around building a simple table creation and query API and can be used with any front end you would like.
// WIP
____________________________________________

# Example Usage

## Load Config to React State
```
class App extends Component {
  constructor() {
  super();
    let opt = {}
    opt.peers = ["http://localhost:8080/gun"]
    opt.localStorage = false
    this.gun = Gun(opt);
    window.gun = this.gun;
    
    this.state = {
      config: {}
    }
  }
  componentDidMount(){
    let self = this
    gun.loadGBase(self) //will load in to this.state.config
  }
  render() {
    return (
  ```
  gun.loadGBase() will return the config object on every change to the config.
## Creating a new Base
```
gun.newBase('Base Name', 'First Table Name', 'Key Column Name on First Table')
```
There is an optional 4th argument which will be the Base ID. This should be sufficiently unique as a collision on the graph would merge Bases. If nothing is passed in a `'B' + Random 12 digit alpha numeric` will be generated. The return value from the above command will be the Base ID string.

## .gbase() chain
This is slightly different than the gun.chain api, but the general point is the same. Everything following `gun.gbase(BaseID)` will use the gbase API and not the gun api. There are a couple exceptions where .on(CB) is still used to subscribe to data.
## Changing configurations
### Change Base/Table/Column Name
.config() will flag the current chain commands to alter the config data and not edit the actual user data.
```
gun.gbase(BaseID).config().edit({alias: 'New Name'}) //Base Name
gun.gbase(BaseID).getTable('Current Table Name').config().edit({alias: 'New Table Name'}) //Table Name
gun.gbase(BaseID).getTable('Current Table Name').getColumn('Current Column Name').config().edit({alias: 'New Column Name'}) //Table Name
```
### Other Config Options
.edit object can contain the following keys to change:
```
baseParams & tableParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false}

columnParams = {alias: 'string', sortval: 0, vis: true, archived: false, deleted: false, required: false, default: false}//default would be a default value if value was not given on new row creation.
```
## Adding Tables/Columns/Rows
The same chaining concepts apply from above:
```
gun.gbase(BaseID).addTable('New Table Name', 'Key Column Name')
gun.gbase(BaseID).getTable('Table Name').addColumn('New Column Name')

//addRow needs a .edit({}) at a minimum to actually write the row to DB
gun.gbase(BaseID).getTable('Table Name').addRow('Human ID').edit({})//Human ID must be unique, but can be human readeable as it is aliased within GBase
```
## Importing Data
Currently have an API for .tsv files, not .csv
```
let file = rawTSVfile.toString()
let output = gun.tsvParse(file)
gun.gbase(BaseID).importTable(output, 'Table Name')
//creates a new table with alias: 'Table Name'
```
importTable will merge data with existing table or create a new table if not found (confirm prompts in the browser to determine what to do). There is an optional 3rd argument that if entered should be the current table name you want to import the data to, and the second argument will rename the specified table to be that value.

## React Specific API's
buildTable will load all the columns in to their own state objects
buildRow will 'compose' the row from all the columns in state (does not query gun)
```
componentDidMount(){
    let self = this
    gun.gbase(BaseID).getTable('Table Name').buildTable(self) //will load each column in to this.state[ColumnName]
  }
  componentDidMount(){
    let self = this
    gun.gbase(BaseID).getTable('Table Name').getRow('Humand ID').buildRow(self) //will load row object in to this.state['Human ID']
  }


```


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