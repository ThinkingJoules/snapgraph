# snapgraph
snapgraph is a wrapper around Gun(^0.2019.612)

This is sort of a command line (or console if you expose snapgraph to window) tool to help organize and connect nodes in graph. It echoes of Neo4j, but approaches lables/node typing differently. This is currently a WIP so beware. Everything will change and data on disk will break.

**[CLICK HERE TO GO DIRECTLY TO THE API DOCS!!](#api-docs)**

# Features
* Define nodeTypes with properties that snapgraph will enforce such as uniqueness*, data type, incrementing*, etc,
* Indexing nodes by adding 'Labels'
* Relating nodes with a relationship
* Basic queries and graph traversal (API works, but is messy)
* Helper chain api functions to list all things given it's context (nodeTypes, relations, or properties on either of them depending on chain context)
* Data inheritance from other nodes (Similar to javascript prototypical inheritance of using Object.create()) 
____
(coming soon)
* Expand Query (start from a node and traverse given a set of rules)
* Functions (functions will run when dependent data changes)
* Permissions enforced by super peer (group based)

*To the best effort given the limits of how Gun operates underneath
# Example Usage (some of this is out of date)

TODO MAKE README INTO STARTUP GUIDE  
MOVE ALL APIs INFO TO SEPERATE DOCS??

## Loading gun instance in to snapgraph
```
import Gun from 'gun/gun';
import {gunToSnap, snap} from 'snapgraph'


let opt = {}
opt.peers = ["http://localhost:8080/gun"]
let gun = Gun(opt);

let bases = ['someID']
let full = true //default false, if true it will load ALL configs for the baseID supplied
gunToSnap(gun,{bases,full},()=>{console.log('snap chain.api ready!)});
```
## Creating a new Base
SEE [.newBase() API](#newBase)

## snap chain
This is slightly different than the gun.chain api, but the general point is the same. The chain commands change as you traverse the api, for example:
```
//using snap identifiers
snap.base('B123456abcdef').nodeType('1tso3').node('!B123456abcdef#1tso3$so3d_239432').subscribe(data => console.log(data))

//using the aliases the user specified
snap.base('Cool Database').nodeType('People').node('!B123456abcdef#1tso3$so3d_239432').subscribe(data => console.log(data))


```
## Changing configurations
### Change Base/NodeType/Property Name
.config(Obj) will change the configuration settings of the current chain head.
```
snap.base(BaseID).config({alias: 'New Name'})//Base Name
snap.base(BaseID).nodeType(type).config({alias: 'New Type Name'})//NodeType Name
snap.base(BaseID).nodeType(tval).prop(pval).config({alias: 'New Property Name'})//Table Name
```

## Adding NodeType(or Relations)/Properties/Nodes
The same chaining concepts apply from above:
```

```
## Importing Data
SEE [.importNewNodeType() API](#importNewNodeType)

# Functions
## and derived data (out of date, but intent is to make something like this)
Snap supports functions that can pull data from one layer down (or above) and do math and put the result in the column specified with the function.
```
let BaseID = b123
let userFN = 'SUM({b123/t3/p2},{b123/t3/p4}) * {b123/t3/p6.b123/t5/p1}'
snap.base(BaseID).table('t3').column('p5').config({propType: 'function', fn: userFN})

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

#### Functions (helper)
```
//in your function config component
import {fnOptions, fnHelp} from 'snapgraph'


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
There are 2 types of nodes in snapgraph.
* nodeTypes (Things) - These are the nodes in the graph
* Relationships - These are the edges  

Nodes can only connect to other nodes by way of relationships. All nodes of the same type are indexed together, so disconnected nodes are still found.

**/Key Conepts**



# **API Docs**
[Chain constructors](#chain-constructors)  
* [base](#base)
* [nodeType](#nodeType)
* [relation](#relation)
* [node](#node)
* [prop](#prop)
------
[Creation API's](#creation-apis)
* [newBase](#newBase)
* [newNodeType](#newNodeType)
* [newRelation](#newRelation) (not updated)
* [addLabel](#addLabel)
* [addProp](#addProp)
* [newNode](#newNode)
* [newFrom](#newRow) (not updated)
------
[Data getter/setter APIs](#getter-and-setter-apis)
* [edit](#edit)
* [relatesTo](#relatesTo) (not updated)
* [subscribeQuery](#subscribeQuery)
* [retrieveQuery](#retrieveQuery)
* [subscribeExpand](#subscribeExpand)
* [retrieveExpand](#retrieveExpand)
* [subscribe](#subscribe)
* [retrieve](#retrieve)
* [kill](#kill) (for removing subscriptions)


------
[Config APIs](#config-apis)
* [config](#config)
* [getConfig](#getConfig)
-----
Import APIs
* [importNewNodeType](#importNewNodeType)
* [importRelationships](#importRelationships)
-----
Non-chain helper APIs

----





# **snap Chain -Basic APIs-**
There are `.ls()` and `.help()` functions you can try to access in console to help understand the api chain
```
snap.help() //show you your current options and commands to pick from

snap.ls() //should give you all available bases that will work in `.base()` api.

commands themselves should (or will) have a `.help()` log as well like:
snap.node.help()

```
**You should only really need to know the baseID (basically namespace) you want to look at on the graph, snap will get everything below it for you and help you through it with the `.ls()` command**
________
## Chain Constructors
### snap
**snap**  
This is the chain origination
Example usage:
```
snap
```
chain options:  
[.base()](#base)  
[.newBase()](#newBase)  
[.node()](#item)  
[.getConfig()](#getConfig)  
[.kill()](#kill)  


[BACK TO API LIST](#api-docs)
________
### base
**base(*\*baseName*)**  
Arugment is optional **IF** you only have loaded a single base config to your current snap chain  
`baseName = 'Base Alias' || 'baseID`  
**NOTE**: There is a list function that can be accessed like: `snap.base().ls()`  
It will give you all valid options that this api will accept.

Example usage:
```
let baseID = B123 //alias of 'ACME Inc.'

snap.base('ACME Inc.')

snap.base() //if on startup you specified {bases:[baseID]} (only 1 base)
//OR only specified one after startup with snap.getConfig('!'+baseID)


```
next chain options:  
[.nodeType()](#nodeType)  
[.relation()](#relation)  
[.importNewNodeType()](#importNewNodeType)  
[.getConfig()](#getConfig)  
[.config()](#config)  
[.kill()](#kill)  

[BACK TO API LIST](#api-docs)
________
### nodeType
**nodeType( *\*type* )**  
Argument is required  
`type = 'Type Alias' || 'typeID`  
**NOTE**: There is a list function that can be accessed like: `snap.base().ls()`  
It will give you all api options to go down in to the next level.

Example usage:
```
snap.base('ACME Inc.').nodeType('Items')

```
chain options:  
[.node()](#node)  
[.prop()](#prop)  
[.newNode()](#newNode)  
[.addProp()](#addProp)  
[.subscribe()](#subscribe)  
[.retrieve()](#retrieve)  
[.getConfig()](#getConfig)  
[.config()](#config)  

[BACK TO API LIST](#api-docs)
________
### relation
**relation( *\*type* )**  
Argument is required  
`type = 'Type Alias' || 'typeID`  
**NOTE**: There is a list function that can be accessed like: `snap.base().ls()`  
It will give you all api options to go down in to the next level.

Example usage:
```
snap.base('ACME Inc.').relation('PURCHASED')

```
chain options:  
[.node()](#node)  
[.prop()](#prop)  
[.addProp()](#addProp)  
[.subscribe()](#subscribe)  
[.retrieve()](#retrieve)  
[.config()](#config)  
________
### prop
**prop(*\*prop*)**  
Argument is required  
`prop = 'Prop Alias' || 'propID`  

**WARNING** *`.prop()` api is used in two different contexts!! First is in the context of the nodeType or relation (What these docs show). The other returns the same chain options as [.node(address)](#node) see that api for usage*  

**NOTE**: There is a list function that can be accessed like: `snap.base().nodeType(typeID).ls()`  
It will give you all valid options that this api will accept.
Example usage:
```
snap.base('ACME Inc.').nodeType('Items').prop('Part Number')

```
chain options for **nodeType** context:  
[.subscribe()](#subscribe)  
[.retrieve()](#retrieve)  
[.getConfig()](#getConfig)  
[.config()](#config)  

[BACK TO API LIST](#api-docs)
__________
### node
**node(*\*ID*)**  
Argument is required  
`ID = 'nodeID' || 'address`  

**WARNING** *`.node()` has two different usages. First is just for a nodeID the other is for an address see example usage below to see the differences*  

Example usage (all of these calls do the **exact** same thing):
```
let nodeID = '!baseID#typeID$instanceID'
let address = '!baseID#typeID.propID$instanceID' // propID is for 'Cost'

snap.base('ACME Inc.').nodeType('Items').node(nodeID).edit({Cost: '$10'})
snap.node(nodeID).edit({Cost: '$10'})
snap.base('ACME Inc.').nodeType('Items').node(nodeID).prop('Cost').edit('$10')
snap.node(nodeID).prop('Cost').edit('$10')
snap.node(address).edit('$10')

```
chain options for **nodeID** context:  
[.subscribe()](#subscribe)  
[.kill()](#kill)  
[.retrieve()](#retrieve)  
[.getConfig()](#getConfig) (gives you the nodeType/Relation configObj)  
[.newFrom()](#newFrom) (Only available if nodeID is **NOT** a relationship node)  
[.archive()](#archive)  
[.delete()](#delete)  

chain options for **address** context:   
[.edit()](#edit)  
[.subscribe()](#subscribe)  
[.kill()](#kill)  
[.retrieve()](#retrieve)  
[.getConfig()](#getConfig)  (gives you the property configObj)  

[BACK TO API LIST](#api-docs)
__________


## Creation API's
### newBase
**newBase(*configObj*, *basePermissions??*, *cb*)**  
All arguments are optional. Defaults are:  
The alias of the base is **NOT** unique. The namespacing is the baseID, and since we can't control other base alias' then we cannot enforce uniqueness.

**Permissions are not implemented yet, so this may change**

Example usage:
```
snap.newBase({alias:'ACME Inc.'},false,cb)
//cb returns: baseID

```

[BACK TO API LIST](#api-docs)
_________
### newNodeType
**newNodeType(*nodeTypeConfigObj*, *cb*, *propConfigArr*)**  
All arguments are optional.  
**nodeTypeConfigObj**: Config info for the new nodeType you are creating.  
**cb**: Done cb that will fire with error or the new ID if successful.  
**propConfigArr**: Array of property configObj's. This will allow you to create properties enmasse if you know what you want them to be.

Note: An error will be thrown if the nodeType is not unique for the base.

For more info on the valid keys and what they do in the configObj [see config](#config).

Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123"
snap
  .base('ACME Inc.')
  .newNodeType({alias:'Items'},cb,[{alias:'Part Number'},{alias: 'Cost'}])

function cb(value){
  value = Error Object || new ID for this nodeType
}
```
[baseID, configObj? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### newRelation
**newRelation(*relationConfigObj*, *cb*, *propConfigArr*)**  
All arguments are optional.  
**relationConfigObj**: Config info for the new relation you are creating.  
**cb**: Done cb that will fire with error or the new ID if successful.  
**propConfigArr**: Array of property configObj's. This will allow you to create properties enmasse if you know what you want them to be.

Note: An error will be thrown if the relation is not unique for the base.

For more info on the valid keys and what they do in the configObj [see config](#config).

Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123"
snap
  .base('ACME Inc.')
  .relation({alias:'PURCHASED'},cb,[{alias:'Purchase Date',propType: 'date'}])

function cb(value){
  value = Error Object || new ID for this nodeType
}
```
[configObj? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### addLabel
**addLabel(*\*labelName*,*cb*)**  
-cb is optional  
This is used to index/filter/query your nodeType's given certain tags. You must add them using this API before attempting to add them to individual nodes.

Example usage:
```
snap.base('ACME Inc.').addLabel('Pending',function(id){
  id = new ID for 'Pending' || Error
})
```
[label, state? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### addProp
**addProp(*configObj*,*cb*)**  
All arguments are optional.
For valid config options see [config](#config).
Alias must be unique for the thingType you are adding it to.
If you give the configObj.id a value, then it must be unique across all IDs

Example usage:
```
snap.base('ACME Inc.').nodeType('Items').addProp({alias:'Cost',dataType:'number'},(err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value = will return the new prop ID
  }
})
```
[baseID, t0, pval? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### newNode
**newNode(*dataObj*, *cb*)**  
All arguments are optional  
`dataObj = {Column Alias || pval: value} `  
`cb = Function(err, value)`  
Note: A null node will be created if no dataObj provided
Example usage:
```
//assume: 'ACME Inc.' has a baseID = "B123" and "Items" = "1t3ds2"
snap.base('ACME Inc.').nodeType('Items').newNode({name:'Anvil'})
(can use the current alias for conveinence)

OR
(Preffered method)
snap.base("B123").nodeType("1t3ds2").newNode({name:'Anvil'})
This will always work (if an alias changes the first method will fail)



--With Data and CB--
snap.base("B123").nodeType("1t3ds2").newNode({name:'Anvil'}, (err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value = will return the new nodes ID
  }
})
```
[rowID, rowAlias? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### newFrom
**newFrom(*dataObj*, *cb*, *opts*)**  
All arguments are optional  
`dataObj = {[Column Alias || pval]: value} `  
`cb = Function(err, value)`  
`opts = {own,mirror}` see table below.

newFrom API basically creates a node based on data on the nodeID in context (only works with nodeTypes **not** relations). If you specify data in the dataObj then the new node will have that data itself, and then everything not specified will be *inherited* from the context nodeID. So if you give it no dataObj, the two nodes will look exactly the same EXCEPT that every value is inherited from the original. So a change on the original node will also show up in this new node.  

See the example usages for how it works.

Example usage:
```
let NODE1 = !base#type$thing
node @ NODE1 looks like: 
{Name: 'Anvil', Color: 'Gray', Cost: '$10'}

//inherit (reference data on context node)
snap.node(NODE1).newFrom(false,function(newID){
  snap.node(NODE1).edit({Cost:'$15'})//change original

  snap.node(newID).retrieve()// will look like:
  {Name: 'Anvil', Color: 'Gray', Cost: '$15'}//change shows up in new node
},false)

//own:true (copy data to new node)
snap.node(NODE1).newFrom(false,function(newID){
  snap.node(NODE1).edit({Cost:'$15'})//change original

  snap.node(newID).retrieve()// will look like:
  {Name: 'Anvil', Color: 'Gray', Cost: '$10'}//change does not effect new node
},{own:true})



//MIRROR (parallel vs serial inheritance)
let NODE2 = !base#type$inherit
node @ NODE2 looks like: 
{Name: 'Anvil #2', Color: ${NODE1.Color}, Cost: ${NODE1.Cost}}

//default
snap.node(NODE2).newFrom(false,function(newID){
  snap.node(NODE1).edit({Cost:'$15'})//change original

  newID will inherit like:
  {Name: ${NODE2.Name}, Color: ${NODE2.Color}, Cost: ${NODE2.Cost}}
},false)

//mirror:true
snap.node(NODE2).newFrom(false,function(newID){
  snap.node(NODE1).edit({Cost:'$15'})//change original

  newID will inherit like:
  {Name: ${NODE2.Name}, Color: ${NODE1.Color}, Cost: ${NODE1.Cost}}
},false)

```
[nodeID? Read here](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________



## Getter and Setter API's
### edit
**edit(*\*dataObj* OR *\*value*, *cb*, *opts*)**  
cb and opts are optional  
`dataObj = {Prop Alias || PropID: value} || value* `  
`cb = Function(err, value)`  
`opts = {own:false}` See [inheritance](#inheritance) for more info  
**WARNING** If the context is an address you can just give edit the value for that property, the API will effectively do `{[propID]:value}`. If you give it an object **it will not look at the propID/alias in that object**. The api does `{[propID]:Object.values(dataObj)[0]}`  

Example usage (3 chain locations (**2 usages!**)):
```
//assume:
'ACME Inc.'= "B123"
'Items' = '1t2o3'
'Vendor' = '3p3kd'

nodeID = '!B123#1t2o3$abcd'
address = '!B123#1t2o3.3p3kd$abcd'

//because the nodeID or address contains all context, we can skip the middle bits
snap.node(nodeID).edit({'Vendor': 'Anvils 'r Us'})
snap.node(address).edit("Anvils 'r us")


//However, the long api is still valid
snap.base('ACME Inc.').nodeType('Items').node(nodeID).edit({'Vendor': 'Anvils 'r Us'})

snap.base('ACME Inc.').nodeType('Items').node(nodeID).prop('Vendor').edit("Anvils 'r us")

snap.base('ACME Inc.').nodeType('Items').node(address).edit("Anvils 'r us")



--With Data and CB--
snap.node(address).edit("Anvils 'r us", (err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value will return the nodeID
  }
})
```
[nodeID, address? Read here to understand the terminology used.](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### relatesTo
**relatesTo(*\*TRGTnodeID* , *\*relation*, *relationObj* , *cb*)**  
relationObj and cb are optional  
`TRGTnodeID = nodeID that will get the relation as an 'incoming'`  
`relation = 'Relation Alias' || relationID`  
`relationObj = {Prop Alias || PropID: value}`  
`cb = Function(done) // done will be Error or the new relationship nodeID`  
 

Example usage:
```

NODE1 = '!B123#1t2o3$abcd' // some 'Customer'
NODE2 = '!B123#2tdr3$efgh' // some ' Item'
Relation = 'Purchased'

snap.node(NODE1).relatesTo(NODE2,Relation,{Purchase Date: Date.now()})

```
[nodeID? Read here to understand the terminology used.](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### subscribeQuery
**subscribeQuery(*\*callBack*, *queryArr*, *udSubID*)**  
callBack and queryArr is required, others are optional Defaults:  
`callBack = Function(resultArr) `  
`queryArr = [queryArr]` [More info here](#query)    
`udSubID = Symbol()` If you give it a subID, then be sure it is unique across all of your subscription

Subscribe will fire the callback with the **entire** data set that matches that query on every change.  
**\*Because snap caches the data, the node objects themselves will be the same objects, so be sure to not to mutate them!**

* **resultArr** - depends on queryArr options, but default is: `[[{}]]`   
`resultArr[0] = [{},{},{}]` This is the first matching 'path' (based on your match and return statements)
`resultArr[0][0] = {prop1: value, prop2: value}`
`resultArr[0][0].prop1 = value`

The *`udSubID`* (user-defined Subscription ID) was added to allow you to fire the `subscribe()` code itself multiple times without setting up multiple subscriptions. If you specify the same subID twice with two different `callBacks`, then the last fired `subscribe()` callBack will be the only callBack that fires (old callBack is replaced). This allows snap to cache the query result and keep it up to date even if the callback is not currently being used in a UI component.

Data loading and the callBack: Depending on the state of the database and how much data is already loaded the callBack will fire immediately if it has all the data in memory.

Example usage:
```
//assume IDs:
'ACME Inc.'= "B123"
'Items' = '1t2o3'
'Vendor' = '3p3kd'

nodeID = '!B123#1t2o3$abcd'
address = '!B123#1t2o3.3p3kd$abcd'

let CYPHER = ['MATCH (x:Items)'] //if anything has symbols or spaces, backtick 'MATCH (x:`Has Space`)'
let RETURN = [
  {sortBy:['x',['Vendor','DESC']],limit:10},
  {x:{props:['Vendor','Part Number']}}
  ]
let queryArr = [{CYPHER},{RETURN}]
let sub = snap.base('ACME Inc.').subscribeQuery(function(data){
  if(!Array.isArray(data))handleErr(data)
  else //success
  //data = [
    [{Vendor: "Anvils 'r Us", 'Part Number': 'A123'}],
    [{Vendor: 'Rockets Galore', 'Part Number: 'BIG-BOOM'}]]
}, queryArr,'forUIView')
```
[Read here to understand the terminology used.](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### retrieveQuery
**retrieveQuery(*\*callBack*, *queryArr*)**  
callBack and queryArr is required, others are optional Defaults:  
`callBack = Function(resultArr) `  
`queryArr = [queryArr]` [More info here](#query)    

Exactly the same as `subscribeQuery` except it only fires the callBack once.  

[BACK TO API LIST](#api-docs)
_________
### subscribeExpand
**subscribeExpand(*\*nodeArr*, *\*callBack*, *expandParams*, *subID*)**  
callBack and queryArr is required, others are optional Defaults:  
`nodeArr = [nodeID,nodeID,nodeID,...]`
`callBack = Function(resultArr) `  
`expandParams = {expandParams}` See table below.
`subID = Symbol()` If you give it a subID, then be sure it is unique across all of your subscription

Subscribe will fire the callback with the **entire** data set that matches that query on every change.

* **resultArr** - depends on options, but a 'returnAs: paths' look like below: 
`resultArr[0] = [nodeID,[relation],nodeID]` This is the first matching 'path' (based on your match and return statements)
`resultArr[0][1] = [relationID]` has named properties of .SRC and .TRGT that have values of which nodeID is which (so you can determine direction if needed)
`resultArr[0][1].SRC = nodeID`  
The results will be sorted first based on the nodeArr order and if there are multiple paths for that node, it will then sort by the length of the 'path'.  
**NOTE** If you 'returnAs: nodes' you will get the last element in the 'path' array. 'returnAs: relationships' will give you all the odd elements in the 'path' array.  

The *`subID`* (user-defined Subscription ID) was added to allow you to fire the `subscribe()` code itself multiple times without setting up multiple subscriptions. If you specify the same subID twice with two different `callBacks`, then the last fired `subscribe()` callBack will be the only callBack that fires (old callBack is replaced). This allows snap to cache the query result and keep it up to date even if the callback is not currently being used in a UI component.

Data loading and the callBack: Depending on the state of the database and how much data is already loaded the callBack will fire immediately if it has all the data in memory.  

This api is sort of intended to be used in conjunction with a [subscribeQuery](#subscribeQuery) or [subscribe](#subscribe)(nodeType subscription) with option `idOnly:true`. That way you can build a list based on filtering/sorting/etc and then (flatten the array) and use it as the first argument in expand.  


**expandParams**
| ExpandParams[key] | default | typeof | usage | Notes |
|----------------------|---------------|---------|-----------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| returnAs | "nodes" | string | nodes = end node of expansion, relationships = just relationships, paths = full expansion path |  |
| states | ['active'] | array | What can nodes/relations be in paths to be valid | Valid = one or more of 'active', 'archived' |
| skip | 0 | number | used with limit for pagination |  |
| limit | Infinity | number | limit results |  |
| minLevel | 1 | number | Min # of degrees of relations to return paths within |  |
| maxLevel | 1 | number | Max # of degrees of relations to return paths within |  |
| uniqueness | "NODE_GLOBAL" | string | To apply uniqueness to nodes/paths/etc.. | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_optional |
| beginSequenceAtStart | TRUE | boolean | For supplying a sequence to match during expansion | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_starting_the_sequence_at_one_off_from_the_start_node |
| filterStartNode | FALSE | boolean | Filter startNode based on labels | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_start_node_and_label_filters |
| labelFilter | FALSE | array | Label filter argument | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_label_filter_2 |
| relationshipFilter | FALSE | array | default = ['*'] (if no label/relation/sequence filters are given | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_relationship_filter_2 |
| sequence | FALSE | array | Sequence to match | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_sequences_2 |
| endNodes | FALSE | array | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_node_filters |  |
| terminatorNodes | FALSE | array | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_node_filters |  |
| blacklistNodes | FALSE | array | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_node_filters |  |
| whitelistNodes | FALSE | array | https://neo4j-contrib.github.io/neo4j-apoc-procedures/3.4/path-finding/path-expander/#_node_filters |  |


Example usage:
```
nodeID = '!B123#1t2o3$abcd' //could have been from another query.

let expandParams = {limit:10, relationshipFilter:['FRIENDS_WITH']}
let sub = snap.base('ACME Inc.').subscribeExpand([nodeID],function(data){
  if(!Array.isArray(data))handleErr(data)
  else //success
  //data = [
    [nodeID1],
    [nodeID2]]
}, expandParams,'forUIView')
```
[Read here to understand the terminology used.](#snap-vocab)  

[BACK TO API LIST](#api-docs)
_________
### retrieveExpand
**retrieveExpand(*\*nodeArr*, *\*callBack*, *expandParams*)**  
callBack and queryArr is required, others are optional Defaults:  
`nodeArr = [nodeID,nodeID,nodeID,...]`
`callBack = Function(resultArr) `  
`expandParams = {expandParams}` See table below.

Exactly the same as `subscribeExpand` except it only fires the callBack once.  
[BACK TO API LIST](#api-docs)
_________
### subscribe
**subscribe(*\*callBack*, *opts*)**  
callBack is required, others are optional Defaults:  
`callBack = Function(data, colArr) `  
`opts = {}` See below for options

**WARNING** subscribe is used in **4** ways and the options vary for each.
* `snap.base(baseID).nodeType('Items').subscribe()` **[nodeType subscription](#nodeType-subscription)** 
* `snap.base(baseID).nodeType('Items').prop('Part Number).subscribe()` **[property subscription](#property-subscription)** 
* `snap.node(nodeID).subscribe()` **[node subscription](#node-subscription)** 
* `snap.node(address).subscribe()` **[address subscription](#address-subscription)** 

#### nodeType subscription  
**This is just a wrapper around [subscribeQuery](#subscribeQuery)**
* callback is fired with entire query results on every change.
* since this will never traverse across another nodeType the arguments have been flattened in to one opts object 
* returns array with same structure as [subscribeQuery](#subscribeQuery)

| Opts[key] | default | typeof | usage | Notes |
|---------------|-----------------------------------|----------------|-----------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| sortBy | FALSE | array | [('prop Alias' OR propID),('ASC' OR 'DESC')] | You can specify multiple sort columns, will sort from left to right in array to break ties. |
| skip | 0 | number | skip first 'x' results |  |
| limit | Infinity | number | limit total results to 'x' |  |
| idOnly | FALSE | boolean | Don't return properties, but perform full query returning only the id's | You can specify properties, and it will generate addresses for them in the metaData |
| returnAsArray | FALSE | boolean | {prop1:value1} or [value1] | For building tables easier |
| propsByID | FALSE | boolean | Default is to return using the current alias, can return using the snap id for that prop instead |  |
| noID | FALSE | boolean | On the nodeObj there is a non-enumerable '.id' property, this omits it. |  |
| noAddress | FALSE | boolean | same as 'noID', but for the '.address' non-enumerable property on the nodeObj | Useful for subscribing specific UI components directly to a particular callback on a property. |
| noInherit | FALSE | boolean | On the nodeObj there is a non-enumerable '.inherit' property, this omits it.|  |
| raw | FALSE | boolean | Apply formatting per the configs.format |  |
| subID | Symbol() | string, Symbol | Will be used as the key in the subscription management in snap. | Should be sufficiently unique |
| props | all active props on this nodeType | array | If you don't specify any, it will get everything that is not hidden, archived, or deleted |  |
| labels | FALSE | array | subset of nodes that have these tags | will implement not tags as well. |
| filter | FALSE | string |  '{property} > 3' Will sub {} with actual value | Uses the [function library](function-library) |
| range | FALSE | object | {from: unix, to:unix} | Many options, see the [query section](#query) |
| humanID | FALSE | boolean | If idOnly:true and humanID:true then it will return the humanID in an array instead of the snap ID |  |

#### property subscription  
This is exactly the same as [nodeType subscription](#nodeType-subscription) except that it ignores the `props` option and only returns the property in context. All other options apply.

#### node subscription
This is technically a wrapper around the internal snap address subscription.
Returns either an array or an object, depending on options (below).

**This caches the object, so each return is the SAME object, be careful not to mutate!**

Only the last two opts are different than the [nodeType subscription](#nodeType-subscription)

| Opts[key] | default | typeof | usage | Notes |
|---------------|-----------------------------------|----------------|---------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| returnAsArray | FALSE | boolean | {prop1:value1} or [value1] | For building tables easier |
| propsByID | FALSE | boolean | Default is to return using the current alias, can return using the snap id for that prop instead |  |
| noID | FALSE | boolean | On the nodeObj there is a non-enumerable |  |
| noAddress | FALSE | boolean | same as 'noID', but for the 'address' non-enumerable property on the nodeObj | Useful for subscribing specific UI components directly to a particular callback on a property. |
| raw | FALSE | boolean | Apply formatting per the configs.format |  |
| subID | Symbol() | string, Symbol | Will be used as the key in the subscription management in snap. | Should be sufficiently unique |
| props | all active props on this nodeType | array | If you don't specify any, it will get everything that is not hidden, archived, or deleted |  |
| propAs | FALSE | object | A temporarily different alias for the prop | Current alias or ID as key, value as value for this subscription. **DIFFERENT FORMAT FROM propAs in subscribeQuery** |
| partial | FALSE | boolean | If true and returnAsArray = false, will give partial updates | Will always return a single {key:value} per fire of callback |

#### address subscription
Fires callback with new value on change and second arg as what address the value came from (for knowing if it was inherited).

| Opts[key] | default | typeof | usage | Notes |
|-----------|----------|----------------|------------------------------------------------------------------|-------------------------------|
| raw | FALSE | boolean | Apply formatting per the configs.format |  |
| subID | Symbol() | string, Symbol | Will be used as the key in the subscription management in snap. | Should be sufficiently unique |

Example usage:
```
//assume IDs:
'ACME Inc.'= "B123"
'Items' = '1t2o3'
'Vendor' = '3p3kd'

nodeID = '!B123#1t2o3$abcd'
address = '!B123#1t2o3.3p3kd$abcd'

//nodeType subscribe
let opts = {sortBy: ['Vendor','DESC'], limit: 10, props: ['Vendor','Part Number']}
let sub = snap.base('ACME Inc.').nodeType('Items').subscribe(function(data){
  if(!Array.isArray(data))handleErr(data)
  else //success
  //data = [
    [{Vendor: "Anvils 'r Us", 'Part Number': 'A123'}],
    [{Vendor: 'Rockets Galore', 'Part Number: 'BIG-BOOM'}]]
}, opts)
...
snap.base('ACME Inc.').nodeType('Items').kill(sub)


//node subscribe
let opts = {props: ['Vendor','Part Number']}
let sub = snap.node(nodeID).subscribe(function(data){
  if(data instanceof Error)handleErr(data)
  else //success
  //data = {Vendor: "Anvils 'r Us", 'Part Number': 'A123'}
}, opts)
...
snap.node(nodeID).kill(sub)


//address subscribe
let opts = {subID: 'watchMe', raw:true}
let sub = snap.node(address).subscribe(function(data,fromAddr){
  if(data instanceof Error)handleErr(data)
  else //success
  //data = {Vendor: "Anvils 'r Us", 'Part Number': 'A123'}
  //fromAddr === address then value is not inherited
}, opts)
...
snap.node(address).kill(sub)
```
[Read here to understand the terminology used.](#snap-vocab)  

[BACK TO API LIST](#api-docs)

_________
### retrieve
**retrieve(*\*callBack*, *opts*)**  
This is the same as [subscribe()](#subscribe) except that it only fires the callback one time with the data.  
[BACK TO API LIST](#api-docs)
______
### kill
**kill(*\*subID*)**  
This depends entirely on the context. Not all contexts are the same, there are effectively 4 different contexts to use this API.

Example usage:
```
let subID = 'abc'

//configs
snap.base().getConfig(cb,{subID:subID})
snap.kill(subID) //configs are the only subscriptions without any chain context to kill

//queries (anything that uses subscribeQuery underneath)
snap.base().nodeType('Items').subscribe(....{subID:subID})
snap.base().nodeType('Items').prop('Part Number').subscribe(....{subID:subID})
snap.base().kill(subID)

//nodes
let subID = snap.node(nodeID).subscribe()
snap.node(nodeID).kill(subID)

//addresses
let subID = snap.node(address).subscribe()
snap.node(address).kill(subID)
```  
[BACK TO API LIST](#api-docs)
______

## Config APIs

### config
**config(*\*configObj*, *cb*)**  
configObj is required. See below for various keys:  
**Base:** 
* [alias](#alias)
* [archived](#archived)
* [deleted](#deleted)

**NodeTypes:**
* [alias](#alias)
* [archived](#archived)
* [deleted](#deleted)
* [externalID](#externalID)
* [humanID](#humanID)
* [log](#log)

**Relations:** 
* [alias](#alias)
* [archived](#archived)
* [deleted](#deleted)

**NodeType Properties:**
* [alias](#alias)
* [allowMultiple](#allowMultiple)
* [archived](#archived)
* [autoIncrement](#autoIncrement)
* [dataType](#dataType)
* [defaultval](#defaultval)
* [deleted](#deleted)
* [enforceUnique](#enforceUnique)
* [fn](#fn)
* [format](#format)
* [hidden](#hidden)
* [pickOptions](#pickOptions)
* [propType](#propType)
* [required](#required)
* [sortval](#sortval)

**Relation Properties:**
* [alias](#alias)
* [allowMultiple](#allowMultiple)
* [archived](#archived)
* [dataType](#dataType)
* [defaultval](#defaultval)
* [deleted](#deleted)
* [fn](#fn) //?
* [format](#format)
* [hidden](#hidden)
* [pickOptions](#pickOptions)
* [propType](#propType)
* [required](#required)
* [sortval](#sortval)


#### alias
Type: 'string'  
Usage: This is basically an alternate (editable) ID for this particular thing.  
#### allowMultiple
Type: boolean  
Usage: Is a flag to know if this property can have multiple pickList options at once (pickOne vs pickMany fromList)
#### archived
Type: boolean  
Usage: If you set this to `true` it will no longer fetch this thing on the default API's.  
**NOTE**: No data is changed. This is basically only a flag. It will not allow you to edit data on anything that is archived.
#### autoIncrement
Type: 'string'  
Usage: Only for nodeType properties. Syntax is 'Number()ToIncrementOnEachNewNode' with optional .. +','+'Number()ToStartWith'  
Example: '1' => 0,1,2,.. '1,1000' => 1000,1001,1002... '5,100' => 100,105,110
#### dataType
Type 'string'  
Usage: This is the dataType to restrict this field to. unorderedSet is stored as an object, array is stored as a string.  
Valid: 'string','number','boolean','unorderedSet','array'  
**NOTE**: 'array' is simply a JSON.stringify([]). Avoid use as much as possible, as it may give unexpected data mutations on concurrent edits.
#### defaultval
Type: 'string' || number || boolean  
Usage: On node creation, this value will be added to this property if it is not specified.
#### deleted
Type: boolean  
Usage: If set to true, this will no longer load this config, and will not work in the API's.  
**NOTE**: This will attempt to delete everything 'below' it. So if you delete a nodeType, this will null all values on all nodes. On a property config, this will null this property value on all nodes of this nodeType.    
**WARNING There is no undo. This will destroy data.**
#### enforceUnique
Type: boolean  
Usage: This will attempt to keep all values on this property unique across all nodes in this nodeType.  
**NOTE**: This requires reading this value on ALL nodes of this nodeType before writing to the database. So beware this will effect performance depending on the number of nodes of this nodeType.
#### externalID
Type: 'string' 
Usage: This will be the ID of the property that has an imported or specified externalID. This will make the property specified `{enforceUnique:true}`.
#### fn
Type: 'string'  
Usage: This is your function that will derive the value of this property. See [functions for more info](#functions)
#### format
Type: 'string'  
Usage: This is to apply specific formatting to raw data (raw:false in queries; this is default) as it comes out of the database. See [formatting options here.](#formatting)
#### hidden
Type: boolean  
Usage: Only on properties. This is basically saying that it is metaData and should not be retrieved if asking for 'all active' props
#### humanID
Type: 'string'  
Usage: This is similar to externalID except that it does not have to be unique. This can be used to load in some sort of 'human name' on nodes that can be used for link making in the app to get you to a view that shows the referenced node.
#### log
Type: boolean  
Usage: Determines whether to log changes to nodes of this nodeType.  
**NOTE**: Setting this to `true` will considerably increase the size of the database and should not be enabled for anything that gets updated often.
#### pickOptions
Type: array  
Usage: Used in conjunction with propType = 'pickList'
#### propType
Type: 'string'  
Usage: This is what most of the configs are used in conjunction with. Below are the options and what they mean.  

* data  
This can be any dataType. This is what most properties will be.

* date  
This is specifically a date type, which means Snap will index all the dates so querying by a date range is very efficient. This will convert all date objects to a unix string and store as a number (dataType will be changed to 'number'). If you supply a number, it will assume that it is the unix time you are wanting to specify.
* function  
This is used in conjunction with the 'fn' config. See [functions for more info](#functions)
* pickList  
Used in conjunction with 'pickOptions' and 'allowMultiple' to evaluate incoming edits.
* state  
This is a special property that Snap adds to all nodes. The default is 'hidden:true' so it is not returned in queries unless specified. It's ID will be 'STATE'. 
* labels  
This is only on nodeTypes (not relations). It is a special property that Snap adds to all nodes. The default is 'hidden:true' so it is not returned in queries unless specified. It's ID will be 'LABELS'. 
* source  
This is only on relations (not nodeTypes). It is a special property that Snap adds to all nodes. The default is 'hidden:false' so it **is** returned in queries requesting 'all active' props. It's ID will be 'SRC'. 
* target  
This is only on relations (not nodeTypes). It is a special property that Snap adds to all nodes. The default is 'hidden:false' so it **is** returned in queries requesting 'all active' props. It's ID will be 'TRGT'.  

#### required
Type: boolean   
Usage: This will validate on node creation to ensure that this property has a value.

#### sortval
Type: number   
Usage: This will be the order the properties will be returned in if 'all active' are requested.  

[BACK TO API LIST](#api-docs)
_________
### getConfig  
**getConfig(*cb*, *opts*)**  
cb will fire with the config object for the chain context or for the path provided in opts.

```
opts = {
  path: '!'+baseID (for adding a new base to this snap chain) || nodeID(for that type config) || address(for that property config)

  subID: If provided, will subscribe and fire callback with full config object at each change

  full: Only used for a '!'+baseID path. Determines whether to do a minimal load, or get all configs
}
```

Example usage:
There are a couple ways to use.
```
//To add a new base to the api chain:
snap.getConfig(cb,{path:'!B123'}) // if B123 was already mounted to this chain, it would return it't configs

//To get by context
snap.base('B123').nodeType('Items').getConfig(cb)

//To get by path
nodeID = '!B123#1t2o3$abcd'
snap.getConfig(cb,{path: nodeID, subID: 'forUI'}) //Will subscribe the nodeType config object
...
snap.kill('forUI') //config subs are not namespaced by path. It is the only subscription that can killed without context.

```
________
## **snap chain - Import APIs -**
### importNewNodeType
**importNewNodeType(*\*(tsv || array)*, *configObj*,*opts*, *cb*)**
This api is for importing a new node type in to snap, building the configs from the data.

tsv || array = should have a single header row for the properties on each node.  Should be 2D `[[headerRow],[dataRow1],[dataRow2],etc]`
configObj = for this nodeType (not any of the properties). For more info see [config options](#config-options).
opts = {labels: 'Header Name that contains anything that has labels you want to tag the nodes with'}
cb = function(error||undefined). If there is an error, the cb will fire with an error object, otherwise it will return the new node type id

Usage:

```
snap.base(baseID).importNewNodeType(data,{alias: 'Things'},false,console.log)
```
[BACK TO API LIST](#api-docs)
__________
### importRelationships
**importRelationships(*\*(tsv || array)*, *srcArg*, *trgtArg*, *cb*)**
This api is for importing relationships to an **existing** relation in the databse.  
Requirements for this api to work:
* Source and Target nodeTypes MUST have externalID's
* The imported file/array must have all the same nodeTypes for the 'Source' column
* The imported file/array must have all the same nodeTypes for the 'Target' column (can be same or different from the source column)

tsv || array = should have a single header row for the properties on each node.  Should be 2D `[[headerRow],[dataRow1],[dataRow2],etc]`
srcArg = {[src nodeType ID or alias]: 'Header value for the sources'}
trgtArg = {[trgt nodeType ID or alias]: 'Header value for the targets'}
cb = function(error||undefined). If there is an error, the cb will fire with an error object, otherwise it will return the new node type id

Usage:

```
//data = [['User','hasFriend','since'],[userID,otherUserID,2003]]
snap.base(baseID).relation('FRIENDS_WITH').importRelationships(data,{People: 'User'},{People: 'hasFriend'}false,console.log)
```
**NOTE** In example above, the 'since' property will be created if it is not found on the 'FRIENDS_WITH' relationship type.  

[BACK TO API LIST](#api-docs)
__________


## Snap Helper Functions

# Query
Currently query is really messy. This may change and will probably be the most fragile part of the snap api.
**Below are the arguments for `subscribeQuery(cb,**queryArr**)`, however `snap.base().nodeType().subscribe()` uses these same arguments, they are formatted in a more conveient object to pass in.**

Currently all queries need to have at least a single [CYPHER](#cypher) statement and a single [RETURN](#return) statement. The other arguments [STATE](#state), [RANGE](#range), [FILTER](#filter) are optional.

Below we will be creating a single query thoughout all of the examples here is the data they are searching through:  

Note: 'Joined' is a snap propType = 'date', is actually a unix number.
(a:Person {Name: 'Alice', Age: 34, Joined: 8/15/18})  
(b:Person {Name: 'Bob',   Age: 35, Joined: 1/18/19})  
(c:Person {Name: 'Carol', Age: 33, Joined: 4/26/19})  

(a)-[:FRIENDS_WITH {since: 2000}]-(b)  
(a)-[:FRIENDS_WITH {since: 2002}]-(c)
(b)-[:FRIENDS_WITH {since: 2001}]-(c)

_________
## CYPHER
**{CYPHER: [*\*cypherString* ]}**
A single item in the array, that is a string. ALL QUERIES MUST HAVE A CYPHER STATEMENT

**THIS IS CURRENTLY LIMITED TO A VERY SIMPLE FORM OF *MATCH***  
Currently valid Arguments:
* 'MATCH ()'
* 'MATCH ()-[]-()' 
* 'MATCH ()-[]->()<-[]-()' You can continue with as many of them as you would like, and can use direction.

Currently valid () & [] (elements) internal arguments:
* () OR [] Unidentified element
* (x) OR [x] Just naming an element for use later in the query
* (x:Person) OR [x:FRIENDS_WITH] Element with name and a label (or nodeType, they are treated the same)
* (:Person:\`label with spaces\`) Multiple labels, anything that has **symbols or spaces** needs to be in backticks
* (:Person:!Online) Not labels have '!' before the label name. Get things that have the Items label but do not have the 'Online' label.
* [x:FRIENDS_WITH|RELATED_TO] Can allow OR by using a vertical bar between relations (no colon).


As you can see, there is no filtering in the match statement. The match statement is only for giving us the pattern.

Full Cypher argument:
```
let queryArr = []
let cypher = {CYPHER:['MATCH (p:Person)']}
queryArr.push(cypher) //order does not matter in the query array

(we will use this argument below on all of the other examples)
```
Further filtering and refinement of the query will be specified in the other arguments we add to queryArr
_________
## RETURN
**{RETURN: [*\*returnConfig*, *\*namedElement_1_Config*, ...*namedElement_n_Config*]}**  
The first two elements in the array are required, accepts as many additional aruments as named elements from the match statement. ALL QUERIES MUST HAVE A RETURN STATEMENT  

The order of the **namedElementConfigs** will effect the order in which they return in the second array ('j' value)

Results will be:  
i = the matched path  
i,j = the particular node in that particular path  
and if **returnAsArray** = `true` then:  
i,j,k = the particular property (value) in the 'j' node in the matched path 'i'  
'k' will be determined by the order you added the props in to the 'props' array in the namedElementConfig.

### **returnConfig**:
| returnConfig[key] | default | typeof | usage | Notes |
|-----------|----------|---------|-------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| sortBy | FALSE | array | [element,('prop Alias' OR propID),('ASC' OR 'DESC')] | Element, is the name you gave the element in match. You can specify multiple sort properties, but only one element. Sort happens from left to right in array to break ties. |
| skip | 0 | number | skip first 'x' results |  |
| limit | Infinity | number | limit total results to 'x' |  |
| idOnly | FALSE | boolean | Don't return properties, but perform full query returning only the id's | You can specify properties, and it will generate addresses for them in the metaData |

### **namedElementConfig**:
Will take the shape of `{[elementName]: configs}` Below is the options for the 'configs' object:

| configs[key] | default | typeof | usage | Notes |
|---------------|-----------------------------------|---------|---------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| returnAsArray | FALSE | boolean | {prop1:value1} or [value1] | For building tables easier |
| propsByID | FALSE | boolean | Default is to return using the current alias, can return using the snap id for that prop instead | {Name: 'Bob'} vs {2p2j3: 'Bob'} (latter is how it is stored in the database) |
| noID | FALSE | boolean | On the nodeObj there is an 'id' non-enumerable property with the nodeID | data[0][0] = {Name: 'Bob'}  data[0][0].id = '!baseID#1t3k$10d_3993' |
| noAddress | FALSE | boolean | same as 'noID', but for the 'address' non-enumerable property on the nodeObj | Useful for subscribing specific UI components directly to a particular callback on a property. |
| noInherit | FALSE | boolean | On the nodeObj there is a non-enumerable '.inherit' property, this omits it.|  |
| raw | FALSE | boolean | Apply formatting per the configs.format | See [format options](#format-options) |
| idOnly | FALSE | boolean | Don't return properties, but only the ID for this particular element | You can specify properties, and it will generate addresses for them in the metaData |
| props | all active props on this nodeType | array | If you don't specify any, it will get everything that is not hidden, archived, or deleted |  |
| humanID | FALSE | boolean | If idOnly:true and humanID:true then it will return the humanID in an array instead of the snap ID |  |

Full Cypher argument:
```
let queryArr = []
let cypher = {CYPHER:['MATCH (p:Person)']}
queryArr.push(cypher) //order does not matter in the query array
let returnArg = {RETURN:
  [
    {sortBy:['p','Name','DESC']}, //returnConfig
    {p: {props: ['Name','Age']} //namedElementConfig
  ]}
}
queryArr.push(returnArg)

snap.base(baseID).subscribeQuery(function(data){
  data = [
  [{Name: 'Alice', Age: 34}],
  [{Name: 'Bob', Age: 35}],
  [{Name: 'Carol', Age: 33}]
  ]
  data[0][0].id = !baseID#typeID$aliceID

  data[0][0].address = 
  [!baseID#typeID.nameID$aliceID,
  !baseID#typeID.ageID$aliceID]

},queryArr)

```
Further filtering and refinement of the query will be specified in the other arguments we add to queryArr
__________
## RANGE
**{RANGE: [*\*element*, *configObj*]}**

**element**:  
This is simply the name you gave the element in the MATCH statement

**configObj**:  
Has keys of property names, and values of `rangeParameters` objects.  
Should look like:
```
configObj = {'Last Login':rangeParameters}
**NOTE**: property must be have a propType: date
```
**rangeParameters**:  
Below is a table explaining the usages.  
NOTE: All arguments are optional, however if some are specified others cannot be. **If you specifiy `relativeTime`, `toDate`, or `lastRange` you cannot specify a `from` or `to`**

| rangeParameters[key] | default | typeof | usage | Notes |
|----------------------|-----------|--------|----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| from | -Infinity | number | someDateObject.getTime() | Must be a unix timestamp |
| to | Infinity | number | someDateObject.getTime() | Must be a unix timestamp |
| relativeTime | FALSE | string | Sets `from` based on argument.  Format: Number() + oneOf['y','w','d','h','m'] | 50d would set `from` = Date.now()-50 days;  10w would set `from` = Date.now()-70 days;  30m would set `from` = Date.now()-30 minutes |
| toDate | FALSE | string | Sets `from` based on argument.  'year','month','week', 'day'... toDate | value of 'month' would set `from` to first ms in current month |
| lastRange | FALSE | string | Sets `from` and `to` based on arguements.  LAST...  'year','quarter','month','week', 'day', 'hour' | value of 'month' would set `from` to first ms in LAST month and `to` to last ms in LAST month. |
| firstDayOfWeek | 0 | number | Used to modify the 'lastRange' date so you can get the correct 'last week' | 0 = Sunday, 6 = Saturday |

Full Cypher argument:
```
let queryArr = []
let cypher = {CYPHER:['MATCH (p:Person)']}
queryArr.push(cypher) //order does not matter in the query array
let returnArg = {RETURN:
  [
    {sortBy:['p','Name','DESC']}, //returnConfig
    {p: {props: ['Name','Age']} //namedElementConfig
  ]}
}
queryArr.push(returnArg)

let range = {RANGE:['p',{Joined:{from:new Date(1/1/19).getTime()}}]}
queryArr.push(range)

snap.base(baseID).subscribeQuery(function(data){
  data = [
  [{Name: 'Bob', Age: 35}],
  [{Name: 'Carol', Age: 33}]
  ]
},queryArr)

```
_________
## FILTER
**{FILTER: [ *\*fnString* ]}**  
`fnString` is a string that will be evaluated against each node. It is looking for a true or false return and uses the [function library](#function-library) underneath, see [Functions](#functions) for more detail. The only difference is that the reference to the property is simply the property alias (or ID) in brackets: `{Name}`.
An example on how to filter column 'Age' on a value '30': `'{Age} = 30'`. If you are filtering using a number you can use the following comparators: <, >, =, !=, <=, >=. If you are trying to exact match a string, then you can only use: =, !=. If you want to use regex, see the [TEST](#test) function.


Full Cypher argument:
```
let queryArr = []
let cypher = {CYPHER:['MATCH (p:Person)']}
queryArr.push(cypher) //order does not matter in the query array
let returnArg = {RETURN:
  [
    {sortBy:['p','Name','DESC']}, //returnConfig
    {p: {props: ['Name','Age']} //namedElementConfig
  ]}
}
queryArr.push(returnArg)

let range = {RANGE:['p',{Joined:{from:new Date(1/1/19).getTime()}}]}
queryArr.push(range)

let filter = {FILTER:['{Age} > 33']}
queryArr.push(filter)

snap.base(baseID).subscribeQuery(function(data){
  data = [
  [{Name: 'Bob', Age: 35}]
  ]
},queryArr)

```
_________
## STATE
**{STATE: [ *\*configObj* ]}**  
This is to determine which states are allowed while traversing a path on any given element in MATCH.  

configObj will have keys of 'element' names and value of an array with valid values of:  
* 'active'
* 'archived'

This will only pass the node if it's 'state' is included in the array. Default value = `['active']`


Full Cypher argument:
```
let queryArr = []
let cypher = {CYPHER:['MATCH (p:Person)']}
queryArr.push(cypher) //order does not matter in the query array
let returnArg = {RETURN:
  [
    {sortBy:['p','Name','DESC']}, //returnConfig
    {p: {props: ['Name','Age']} //namedElementConfig
  ]}
}
queryArr.push(returnArg)

let range = {RANGE:['p',{Joined:{from:new Date(1/1/19).getTime()}}]}
queryArr.push(range)

let filter = {FILTER:['{Age} > 33']}
queryArr.push(filter)

let state = {STATE: {p:['active','archived']}}
queryArr.push(state)


snap.base(baseID).subscribeQuery(function(data){
  data = [
  [{Name: 'Bob', Age: 35}]
  ]
},queryArr)

```
_________


# snap Vocab
Snap has many concepts that are referenced in the docs. Here are some definitions:
* **baseID**: The uuid/identifier of the base
* **nodeID**: In snap, this ID reference a **whole** node. ID will contain the following symbol identifiers !#$ for nodes !-$ for relations
* **address**: In snap, this ID reference a **single** property on a node. ID will contain the following symbol identifiers !#.$ for nodes !-.$ for relations. This is the level that snap operates on.
* **externalID**: This is the property that we are keeping values unique on as a secondary identifer to the snap ID.
* **path**: path is similar to we file path /baseID/ThingType/Prop would be equal to !baseID#Thing.Prop using the snap identifiers. However /baseID/ThingType/Node/Prop would be in a different order (fixed ordering for snap IDs) !baseID#ThingType.Prop$Node
* **Source**: This is part of how relationships are conceptualized. `"source"` is the node that is linking **to** another node. Thought of as 'outgoing' relation
* **Target**: Opposite of 'source'. This has an 'incoming'  relation **from** a 'source' node.
* **configObj**: Each 'level' to the database has a configuration object that governs how snap acts and responds to data on that level. The base has a configObj, each nodeType and relation has it's own configObj, and every property has it's own configObj. These are what the [.config()` api](#config) operates on.

### FAQs
Will fill this out as I receive feedback.


# Credit
* Would like to thank @amark for building [GunDB](https://gun.eco/docs/Introduction). Very cool project and a new way to interact with data. Excited to see this project grow with the future development with AXE and the other ecosystem products he is working on.
* Everyone on the [GunDB Gitter](https://gitter.im/amark/gun) who helped answer my questions!