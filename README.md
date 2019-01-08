# GunDB-Wrangler
GunDB-Wrangler is a plugin for Gun(^0.9.x) using `Gun.chain`.

Used to help wrangle your data! Helps you manage nodes in the following ways: define node types, tagging, archiving, linking/unlinking, and opening a linked tree (and do math on it!). For those not familiar with a graph database, this module might make it easier to get started building your first app.

## Features
* **Node Types** (To emulate collections or tables)
* **Automatic node type keying and indexing**: Creates id's and indexes nodes of same type together.
* **Archive Node**: Remove all tags, but keep in place on graph with a `{'!DELETED': true}` flag for filtering out of UI
* **Unarchive Node**: restore tags, remove deleted flag
* **Delete Node**: Null all fileds, unlink from everywhere in graph it was linked (according to Node Type)
* **User Defined Transformations (UDT)**: To perform checks and conditional transforms on data going in to database
* **Node Linking**: Bi-directional set to build a traversable graph
* **Tree Retrieval**: Follow 'prev' links (only) from current node until 'x' iterations or 'root' node is found
* **Tree Reduce Right**: work from the bottom of the tree (where root data is) and apply a function based on Node Type found. Mapping up the tree to reduce the values.
* **Tagging** (with 'proptag/scope' and untagging): Can be combined with the user defined functions for conditional tagging through UDT
* **Tag visibility**: List of tags (and scopes) that can be pulled in to generate drop downs or autofills for UI.
* **Tag queries**: Intersects and returns all nodes that match the full query (&&)

#### Potential Features
* Formal schema validation (Kind of duplicate since UDT could re-implement validation)
* Unique Fields/Auto Incrementing; Technically has no gurantees since Gun is only eventually consistent, so could have conflicts

## When to Use
The initial goal was to do a different gun.open() that selectively follows links (as defined by the Node Type). If using gun.open() you have to be careful not to create many links, even if it would be helpful. But Gun is a graph database, the more linked your data the more rich and accurate your database is. That is why I built this. To link without worry, and still get an 'open' function that doesn't open the whole graph.
This assumes that your graph structure is some form of DAG, or you can define a terminating path.
Initial aim was to be able to model widgets made up of other widgets, and at some point a widget is purchased (root, contains no 'bill of materials'). As long as a stop condition is evident this module *should* work well. If your data looks much different than this, then be careful as I have not tested for it.



# Example Usage / Getting Started
Example of Widgets made of Widgets (+Labor Costs). Example assumes you have a working react app with gun installed.

#### Install
`npm i gundb-wrangler --save`
## Define Node Type
This module is centered around the type of each node in the graph. For this example it will have 3 type:
* Widget (the thing)
* Ops (short for 'Operations' - labor steps)
* BOM (Bill Of Materials, How many and of what widgets)

*Note: I'm diving right in, read [Key Concepts](#key-concepts) to better understand the example*
### Formatting nodeTypes.js 
Make a new file, lets call it `nodeTypes.js` Lets framework it out and fill in data as we go:
```
const Widget = {}
const Op = {}
const BOM = {}

const nodes = {Widget, Op, BOM}
export default nodes
```
Here is the minimum object requirements for each node:
```
const NodeType = {
next: {},
prev: {},
whereTag: [],
methods: {}, 
settle: f(x) ///UDT function goes here
```
#### Think about your data!!
Before we start lets make a sample object for each node type so we can reference as we define our Node Types:
```
// widget
{
  name: 'awesome widget1',
  vendor_unit_cost: 0 //if we assembled it from other widgets
  ops: [op1, op2, op3],
  bom: [bom1, bom2],
  color_tag: [colorTag],
  tags: [tag1, tag2],
  contained_in: [bom4],
  sku: 12345
}
// op
{
  instructions: 'some info',
  processTime: 2,
  rate: 120
  used_in: {}, //reference to a Widget, our 'next'
}
// bom
{
  next: [widget1],
  prev: [widget2],
  qty: 2
}

```
Gun cannot do array's but I have displayed them in an array as that is easiest to explain this. Basically anytime you see/think of something array like, this module can help you deal with that in Gun. Quick explanation of these objects:  
In Widget:
* 'ops' and 'bom' will be 'prev' as they link to nodes that descibe this widget
* 'color_tag' and 'tags' are scoped tag fields (as noted in the *Key Concepts* section, 'tags' is colloquial for global tags)
* 'contained_in' is the next field

In op:
* 'used_in' is the next field, all others are root data

In bom:
* 'next' links to 'next', to where this information belongs
* 'prev' links to another widget, in concert with the 'qty' field we can resolve the cost of the 'next' widget.

#### Defining the Node Types
Here is our nodeTypes.js file with basic info entered:
```
const Widget = {
  next: {contained_in: 'prev'}, //if you follow 'contained_in' link, what key will you find reference to this node ('prev')
  prev: {ops: 'used_in', bom: 'next'},
  whereTag: ['color_tag', 'tags'],
  methods: {}, 
  settle: f(x) ///UDT function goes here
}
const Op = {
  next: {used_in: 'ops'},
  prev: {},
  whereTag: [],
  methods: {}, 
  settle: f(x) ///UDT function goes here
}

const BOM = {
  next: {'next': 'bom'},
  prev: {'prev': 'bom'},
  whereTag: [],
  methods: {}, 
  settle: f(x) ///UDT function goes here
}
``` 
To explain the comment under Widget.next: the key is simple, on the Widget node, what key is the 'next' reference. But why do we put 'prev' as the value. Think about traversing the graph. All structure keys are bi-directional (per this module). So we are saying "if you follow the reference that is in 'contained_in' you will arrive at another node. On that node, what key will contain the link back to where I started." So we start on a Widget, follow the 'next' link to a BOM node type. If we came from a next we are looking for a 'prev'. Convienently I named it 'prev'. In that list of (potentially) many links, there is one that points back to the specific node we came from.

#### Settle
This module wraps gun.put() in it's own api, gun.settle(). When you run .settle() you should get the node it self and not a property on the node. See [API Docs for usage](#api-docs). Basically you pass in data you want to input as a partial object to .settle(). The module will then perform your UDT that is saved under the 'settle' property of that particular Node Type. The settle function is required in your Node Type. **Below is the minimum settle function definition**:
```
function NodeTypeExampleSettle(newData, oldData){
    //also assume oldData will be falsy if this is a new put
    let result = {
        tag_field1: {add: [],remove: []},
        tag_field2: {add: [], remove: []},
        putObj: {}
    };
    return result
```
For each property that is in the whereTag array on the Node Type must have a corresponding key in the result object with an object as shown. Tags are explicit. If you return all add and remove arrays as empty it will not do anything. To remove you must specify tag(s) in the remove array.

**Below is the suggested settle function format**
```
function SuggestedSettle(newData, oldData){
    let result = {
        tag_field1: {add: [],remove: []},
        tag_field2: {add: [], remove: []},
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'NodeType' //This should match your Node Type object name exactly
        //can define defaults for all fields if you so choose
  

        result.putObj = Object.assign({}, defObj, newData)
    }else{ 
      // expecting partial objects (only edits) to be put on updates, not full nodes
      result.putObj = newData
    }

    return result
}
```
Yes, like gun, this module must add stuff to your data in order to work. Everything added will be prefixed with '!' if you want to strip it out of your data for display purposes.
The '!TYPE' field is **THE MOST IMPORTANT**, without it nothing in this module works. Below are the settle functions for each node type:
```
function WidgetSettle(newData, oldData){
    let result = {
        color_tag: {add: [],remove: []},
        tags: {add: [], remove: []},
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'Widget'
        defObj.name = 'noName'
        defObj.vendor_unit_cost: 0
        defObj.ops = false
        defObj.bom = false
        defObj.color_tag = false
        defObj.tags = false
        defObj.contained_in = false
        defObj.sku = null  

        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }

    return result
}
function OpsSettle(newData, oldData){
    let result = {
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'Op'
        defObj.instructions = 'I need directions!'
        defObj.processTime = 0
        defObj.rate = 120
        defObj.used_in = false

        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }
    
    return result
}
function BOMSettle(newData, oldData){
    let result = {
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'BOM'
        defObj.next = false
        defObj.prev = false
        defObj.qty = 0
        
        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }
    
    return result
}
```
I like to create all properties on a new object, you don't have to, but it is easier to look at data if it all looks the same. I always put false for structure or tag links if I want to create them before I populate links or tags.

#### Methods
These are optional, and have to do with how we calculate things in the tree. We will be creating a 'cost' method that will give us the cost of a part by going down the tree until it gets to root data. Each node type needs to have a method with the same exact name. Below is the code for each node type:
```
function WidgetCost(node){
  let total = 0
  total += node.vendor_unit_cost
  total += node.ops
  total += node.bom
  return total
}
function OpCost(node){
  let total
  let minute_rate
  minute_rate = node.rate / 60
  total = minute_rate * node.processTime
  return total
}
function BOMCost(node){
  let total
  total = node.prev * node.qty
  return total
}

```
Look at how simple and easy that math is! Since this is a reducing function, we assume all 'prev' fields will have their reference list replaced by the total 'cost' of all reference below it in the tree.

So all together your nodeTypes.js file should look like this:
```
const Widget = {
  next: {contained_in: 'prev'}, //if you follow 'contained_in' link, what key will you find reference to this node ('prev')
  prev: {ops: 'used_in', bom: 'next'},
  whereTag: ['color_tag', 'tags'],
  methods: {cost: WidgetCost}, 
  settle: WidgetSettle
}
const Op = {
  next: {used_in: 'ops'},
  prev: {},
  whereTag: [],
  methods: {cost: OpCost}, 
  settle: OpSettle
}

const BOM = {
  next: {'next': 'bom'},
  prev: {'prev': 'bom'},
  whereTag: [],
  methods: {cost: BOMCost}, 
  settle: BOMSettle
}
function WidgetSettle(newData, oldData){
    let result = {
        color_tag: {add: [],remove: []},
        tags: {add: [], remove: []},
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'Widget'
        defObj.name = 'noName'
        defObj.vendor_unit_cost = 0
        defObj.ops = false
        defObj.bom = false
        defObj.color_tag = false
        defObj.tags = false
        defObj.contained_in = false
        defObj.sku = null  

        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }

    return result
}
function OpSettle(newData, oldData){
    let result = {
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'Op'
        defObj.instructions = 'I need directions!'
        defObj.processTime = 0
        defObj.rate = 120
        defObj.used_in = false

        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }
    
    return result
}
function BOMSettle(newData, oldData){
    let result = {
        putObj: {}
    };
    let defObj = {}
    if(!oldData){
        //new put
        defObj['!TYPE'] = 'BOM'
        defObj.next = false
        defObj.prev = false
        defObj.qty = 0
        
        result.putObj = Object.assign({}, defObj, newData)
    }else{
      result.putObj = newData
    }
    
    return result
}
function WidgetCost(node){
  let total = 0
  total += node.vendor_unit_cost
  total += node.ops
  total += node.bom
  return total
}
function OpCost(node){
  let total
  let minute_rate
  minute_rate = node.rate / 60
  total = minute_rate * node.processTime
  return total
}
function BOMCost(node){
  let total
  total = node.prev * node.qty
  return total
}

const nodes = {Widget, Op, BOM}
export default nodes
```
Now we are ready to try all of this out! Seems like a long road, but if you have any amount of node types or conditional tagging/indexing it is well worth the effort! Plus it puts all your logic in one spot to keep your UI components easy to understand and read.


### Example Usage
This is some basic API usage used on what we have defined above.

First we must get things imported.
```
//App.jsx
import Gun from 'gun/gun';
import * as wrangle from 'gundb-wrangler'
import nodeTypes from '../nodeTypes/nodeTypes'

class App extends Component {
  constructor() {
  super();
    this.gun = Gun(location.origin+'/gun');
    window.gun = this.gun;
  }

  render() {
    gun.addNodeTypes(nodeTypes)
    return (
```
Now fire up your app, and lets play with gun (and the new module) in the console of your browser.


```
//First lets make 3 new Widgets  
let widget1 = gun.newNode('Widget').settle({name: 'Widget1'})
let widget2 = gun.newNode('Widget').settle({name: 'Widget2'})
let widget3 = gun.newNode('Widget').settle({name: 'Widget3', vendor_unit_cost: 10})

//Next lets make some ops:

let w1op = gun.newNode('Op').settle({instructions: 'Widget1 assembly', processTime: 2, rate: 65})
let w2op = gun.newNode('Op').settle({instructions: 'Widget2 assembly', processTime: 6, rate: 85})
let w2op2 = gun.newNode('Op').settle({instructions: 'Widget2 assembly step 2', processTime: 12, rate: 105})

//And finally 2 BOM's:

let w1bom = gun.newNode('BOM').settle({qty: 2})
let w2bom = gun.newNode('BOM').settle({qty: 4})
// widget3 is a root node, so BOM will stay false

//So we now have 8 data nodes in our graph! However, they are not connected to each other. Lets do that:

widget1.get('ops').link(w1op)
widget2.get('ops').link(w2op)
widget2.get('ops').link(w2op2)
widget1.get('bom').link(w1bom)
widget2.get('bom').link(w2bom)
//now the fun part!
w1bom.get('prev').link(widget2)
w2bom.get('prev').link(widget3)
```
Boom! We now have a traversable graph. 
#### Object tree || .getTree
The .getTree call only needs the node soul for where to start. However, it will also accept a gun object of that node. So you can give it the string `'Widget/1234-idHere-1234'` or `gun.get('Widget/1234-idHere-1234')`. Since we saved the widget creation to a variable `widget1` we can pass that in directly: `gun.getTree(widget1)`. Note: .settle returns a gun object of the node data was inputted.

The .getTree call will return an object, but where there was once links (`{#: "jovop9av01anjkJ2P4yNlli"}`) there now exists an array of objects that those references previously represented. Now you can see the whole object! You can follow the 'bom' array to a 'BOM' node, then the 'prev' array to a 'Widget' node and so on.

#### Cost of each widget || .treeReduceRight
So now the million(?) dollar question, how much do these Widgets cost the company? A company will not exist long if it does not know its cost and therefore its margin. Lets find out:
`gun.treeReduceRight(widget1, 'cost')`
This takes the tree we just looked at, and starts at the 'bottom' or 'root' of the tree (in our case, 'widget3'). Since it does not have any 'ops' or 'bom' it only needs to calculate the cost of the widget itself, `vendor_unit_cost: 10`. With this costs it goes places this value in place of the reference for this object. So `w2bom.prev = 10`. It will then reduce that 'BOM' node, so `w2bom.prev * w2bom.qty`. That is equal to `40`. Then `widget2.bom = 40`. This keeps working up from all root nodes until it reaches `widget1`. So this simply reduces objects based on the math described in the 'cost' method we defined for each node type. It should return an answer of 141.16666.. Do the math by hand and see just how easy this modules makes a task like this!

____________________________________________

## **Key Concepts**
There are 3 types of properties in a node object (according to this module).
* Root Keys - Things with regular types (number, string, boolean, etc.)
* Structure Keys - Things with links to nodes that help define this node
* Tag Keys - Where tag or taglike information is stored for queries or indexing.
### Root Keys
We also refer to a node containing *only* root keys a *root node*.
### Structure Keys
Structure keys are things that this module follows to build the tree or do the 'open'. For each node type we **must** define which keys will contain 'prev' and 'next' references.
##### prev and next ??
These are terms from linked lists. 'next' is going to move you away from root data nodes, 'prev' will move you toward root data nodes. A tree starts with roots (speaking literally), so it cannot have a previous link. Sorry if this is backwards from how you think of 'prev' and 'next' in a linked list, but this is the terms and definitions this module follows. The limitation here is that you can only ever have a single 'next' key.
* Think of 'prev' as things you must follow to resolve your current node (because it is made up of more info!!)
* Think of 'next' as a (singular) list of nodes where you can find a 'prev' link pointing back to this exact node.
### Tag Keys
Each key you define as a Tag Key will be the scope of that tag (if you choose, all tags can be queried globally as well, but could conflict with same tag in different scope). If you want a simple global tag scope, just use the same key name on all node types. If you don't want scoping, simply put a `tags` property on all node types. Tag Keys are basically indexes for queries later. This module allows multiple tags per property, if the developer would rather it be singular add a UDT that always removes the old one when a new tag comes in. *Tag Keys do not effect the tree structure at all.* It is basically there to provide indexed queries of your data to reduce look up times (avoid checking every node and comparing values)  
**/Key Conepts**


## Assumptions/Limitations
Under the hood this module treats everything as a gun.set(). So everything we link, must still be unique. If you want non-unique relations you will have to do something like illustrated in the example as a 'BOM' relation node. Where you create a unique node that contains a reference to a non-unique key, and then link the unique node. As long as you are not creating cirular references everything should work fine.  

We prevent opening the whole graph for a node of given type if we only follow the 'prev' links to generate a tree. There is more info in the [example](#example-usage) to illustrate this. 



# API Docs
### Gun.Chain API
##### Define Node Types
* **gun.addNodeTypes(nodeTypes)**
  This is required to load your node type data in to Wrangler. You can find an example for the format of the `nodeTypes` object in the [Getting Started](#define-node-type) guide.
##### Node Creation and Manipulation
* **gun.newNode('nodeType')**
  Create a new UUID and 'get' string of a type defined in your `nodeTypes` object. It accepts a single parameter that must be a string that is equal to a node type defined in your `nodeTypes` object. `gun.newNode('nodeType')` is the equivalent of doing `gun.get('nodeType/1234-newUUID-4321')`, and that is what is returned from this function.
  Suggested to be chained with `.settle()` instead of `.put()`

* **gun.settle(data)**
  Run your new data through the UDT for this node type. It accepts 1 parameter, an object with your data. Usage:
  ```
  gun.newNode('nodeType').settle({hello: 'world'})
  //or update
  gun.get('nodeType/1234-UUID-4321').settle({hello: 'universe'})
  ```
  This will run your `data` object through your 'User Defined Transformation' (UDT) for that node type. If you do not chain with `.newNode()` for creating a new node, then you either have to format the 'get' string as `nodeType + '/' + !ID` or pass in values for `!TYPE` and `!ID` in your `data` object on the initial settle.
  For more information on the settle UDT please see [the settle section](#settle) in the Getting Started Guide.

* **gun.getTree(startNodeID[, max[, archived]])**
  This will return a tree object by following 'prev' links until a stop condition is met. Stop condition can be either a 'prev' link being falsy (not a link) or passing in the optional 'max' parameter for a limit on the number of 'levels' down the tree you go. If you pass `true` for `archived` then archived nodes will be included in the tree, default is `false`.  Usage:
  ```
  gun.getTree('nodeType/1234-UUID-4321') //gun soul string
  //or gun object
  let node = gun.get('nodeType/1234-UUID-4321')
  gun.getTree(node)
  
  ```
* **gun.getTreeArray(startNodeID[, max[, archived]])**
  Same as `.getTree()` but returns a 2D array where the highest index in the first dimention is the most root data. This is the same array `.treeReduceRight()` works through
* **gun.treeReduceRight(startNodeID, method[, acc[, max]])**
 Works from root data up the tree until it reaches the `startNodeID` specified. It will apply `method` named in your `nodeTypes` object for each node type encountered through the tree. The `method` should be a string. Only the first two parameters are required. `acc` (short for accumulate) is if your `method` always returns data to be summed regardless of node type, or all nodes are of the same type and you specify `max`. Pass `true` for `acc` to sum all values together.
* **gun.link(targetNode)**
 This is a bi-directional `.set()` that must follow what you have defined in the `nodeTypes` object. The correct way to link is by selecting the 'prev' prop and then `.link(node)`:
  ```
  let parentNode = gun.get('nodeType/1234-UUID-4321')
  parentNode.get('prevProp').link(otherNode)
  ```
  If you do not specify a valid 'prev' prop it will not perform the action. However, if you do the inverse and try to link through the 'next' prop on the other node, the function will try to determine the correct direction. The following will properly link as well:
  ```
  gun.get('otherNode/1234-UUID-4321').get('nextProp').link(parentNode)
  ```

* **gun.unlink(targetNode)**
  Has the same requirements as link, this will remove both references in the bi-directional link
* **gun.archive()**
  This will remove all tags so it will not show up in the indexed queries, and it will add a `{!DELETED: true}` flag to the node. Usage:
  ```
  gun.get('nodeType/1234-UUID-4321').archive()
  ```
  *NOTE: When you archive a node, it does not archive anything that is linked under the 'prev' or 'next' props. HOWEVER, `getTree()` will not find any of the 'prev' links because the parent node is marked as archived.*

* **gun.unarchive()**
  This will restore all tags and the node will show up in the indexed queries. It will update the deleted state `{!DELETED: false}`. Usage:
  ```
  gun.get('nodeType/1234-UUID-4321').unarchive()
  ```
* **gun.delete()**
  This will unlink all 'next' and 'prev' references to this node and null out all fields on it. You should only run this after `.archive()` has been run on this node. There are no checks for this currently.  
##### Tagging API
Currently the only way to add or remove tags on an item is throught the `.settle()` command as illustrated below:
```
gun.get('nodeType/1234-UUID-4321').settle({someTagProp: {add:['tag1','tag2'],remove:[tag3]}})
```

* **gun.getTagged([params])**
  `.getTagged()` takes an array containing one or more params objects with your scoped query. Returns an intersect of the params query in an array of objects.
  Usage:
  ```
  let param1 = {tag: 'tag1', scope: 'scopeTag', type: 'nodeType'}
  let param2 = {tag: 'tag2'}
  gun.getTagged([param1,param2])
  ```
  To query global tags, it is suggested to add a common field such as 'tags' to all node types and then query like:
  ```
  let param1 = {tag: 'tag1', scope: 'tags'}
  let param2 = {tag: 'tag2'}
  let param3 = {tag: 'anotherTag'}
  gun.getTagged([param1,param2,param3])
  //returns all nodes with 'tags' of 'tag1' && 'tag2' && 'anotherTag'
  ```

* **gun.tags(params)**
  Takes a params object with keys of 'scope' and 'type'(opt). Returns the tags used in those scopes and their visibility setting. Usage:
  ```
  let params = {}
  params.type = 'nodeType' //this is optional, depending on scope you want.
  params.scope = 'someTagProp'
  gun.tags(params)
  ```
  The idea is that this would give you a list of current tags so you can prefill a dropdown or autofill in the UI. 
  If you do not pass any arguments it will return a list of tags and scopes.

* **gun.archiveTag(params)**
  Takes a params object with keys of 'tag', 'type' and/or 'scope'. Returns the tags used in those scopes and their visibility setting. Usage:
  ```
  let params = {}
  params.type = 'nodeType' //this is optional, depending on scope you want.
  params.scope = 'someTagProp'
  params.tag = 'tag1'
  gun.archiveTag(params)
  ``` 
  This will set that tag to '0' so you can filter it out of UI dropdowns and such.
  *NOTE: This does not effect the nodes in any way! This is purely a thing to help make building UI elements easier.*

  
 

### Wrangle API

* **wrangle.reduceRight(treeArr, method , acc)**
  This is simply exposing the reduce right function used within `.treeReducedRight`. The use case would be if you had multiple method calls to do on the same tree you could call `.getTreeArray()` once and then use that result (passed in as `treeArr`) to run with multiple different `methods`. `acc` is default `false`, which means it will only follow your method returns. If you pass it `true` then all method returns will be summed together as you reduce the tree.


### FAQs
Will fill this out as I receive feedback.


# Credit
* Would like to thank @amark for building [GunDB](https://gun.eco/docs/Introduction). Very cool project and a new way to interact with data. Excited to see this project grow with the future development with AXE and the other ecosystem products he is working on.
* @stefdv for building [gun-tag](https://github.com/Stefdv/gun-tag#readme). I used some of the approaches (and code) in this module, but most of all was able to read the code and understand the approach. This made it much less scary to attempt to build this. +1 for inspiration.
* Everyone on the [GunDB Gitter](https://gitter.im/amark/gun) who helped answer my questions!