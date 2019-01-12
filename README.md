# gundb-gbase
gundb-gbase is a plugin for Gun(^0.9.x) using `Gun.chain`.

Used to make an 'Airtable' like app.
// WIP
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
* Everyone on the [GunDB Gitter](https://gitter.im/amark/gun) who helped answer my questions!