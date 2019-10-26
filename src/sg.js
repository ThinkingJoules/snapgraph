import { toBuffer } from "./util"

export default function SG(root){
    let sg = this
    const validEncodings = ['ascii','utf8','uft16le','hex','base64','latin1'] //for Buffer.from( ,encoding)
    const validDataTypes = ["string", "number", "boolean", "array","set","map","binary","nodeID","address","function",'link'] //binary and map are handled internally
    //const validStructures = ["id","nodeID","address"]
    const validNodePropTypes = ["data", "date", "pickList","function","link","thing","things"]

    let baseT = [
        {_ALIAS:"_PROPS",_ID:0,_CLASS:'config',_PROPS:['_ALIAS','_STATE','_ID',"_PROPTYPE","_DATATYPE","_HIDDEN","_SORT","_DEFVAL","_UNIQUE","_FN","_FORMAT","_OPTIONS","_MANY","_REQUIRED","_CONTEXT","_ISTYPE","_INC","_NEXTINC",]},
        {_ALIAS:"_THINGS",_ID:1,_CLASS:'config',_PROPS:['_ALIAS','_STATE','_ID','_PROPS','_HID','_LOG','_ACTIVE','_ARCHIVED','_CLASS']},
        {_ALIAS:"_CLASSES",_ID:2,_CLASS:'config',_PROPS:['_ALIAS','_STATE','_ID','_REQPROPS']},
        {_ALIAS:"_INDEXES",_ID:3,_CLASS:'config',_PROPS:['_STATE','_VALUE','_TEST','_LIST']},
        {_ALIAS:"_IoI",_ID:4,_CLASS:'config',_PROPS:['_STATE','_ID','_TYPE','_PROP','_INDEXES']},
        {_ALIAS:"TAGS",_ID:5,_CLASS:'data',_PROPS:['_STATE','_ALIAS']},//Tags accross all nodes, part of 'data' class so this is in the core graph
    ]
    let peerT = [//only until someone logs in/claims peer
        //Supporting T's
        {_ALIAS:"PEOPLE",_ID:32,_CLASS:'data',_PROPS:['_SAID']},
    ]
    let extT = [
        //Full
        {_ALIAS:"PEOPLE",_ID:32,_CLASS:'data',_PROPS:['_PUBS','_PEERS','_WKN','_SAID','_STMTS','_TAIL']},
        {_ALIAS:"PEERS",_ID:33,_CLASS:'data',_PROPS:[]},
        {_ALIAS:"STMTS",_ID:34,_CLASS:'data',_PROPS:['PUBKEY','_PREV','WORK','_HEADER']},
        {_ALIAS:"SUBNET",_ID:35,_CLASS:'data',_PROPS:[]}
    ]
    let baseP = [
        //ID for t and p vals
        {_ALIAS:"_ID",_ID:0,_REQUIRED:true,_PROPTYPE:'data',_DATATYPE:['binary'],_UNIQUE:true,_INC:[1,toBuffer(1000)]},
        {_ALIAS:"_CLASS",_ID:1,_PROPTYPE:"pickList",_DATATYPE:['nodeID'],_ISTYPE:[toBuffer(2)]},
        //Alias for t and p vals
        {_ALIAS:"_ALIAS",_ID:4,_REQUIRED:true,_UNIQUE:true},
        //Index Building
        {_ALIAS:"_TYPE",_ID:16,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:['nodeID'],_ISTYPE:[toBuffer(1)]},
        {_ALIAS:"_PROP",_ID:17,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:['nodeID'],_ISTYPE:[toBuffer(0)]},
        {_ALIAS:"_TEST",_ID:18,_DATATYPE:['function']},
        {_ALIAS:"_VALUE",_ID:19,_REQUIRED:true,_PROPTYPE:"data",_DATATYPE:['string','number','binary','boolean']},
        {_ALIAS:"_LIST",_ID:20,_PROPTYPE:'things',_DATATYPE:['map'],_KEYIS:['nodeID'],_VALUEIS:['string','number','boolean','binary']},
        //IoI Building
        {_ALIAS:"_INDEXES",_ID:21,_PROPTYPE:'things',_DATATYPE:['map'],_ISTYPE:[toBuffer(3)],_KEYIS:['binary'],_VALUEIS:['string','number','boolean','binary']},
        //Class Building
        {_ALIAS:"_REQPROPS",_ID:24,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:['array'],_MANY:true,_ISTYPE:[toBuffer(0)],_VALUEIS:['nodeID']},
        //Props on all nodes
        {_ALIAS:"_STATE",_ID:32,_REQUIRED:true,_PROPTYPE:'pickList',_DEFVAL:'active',_OPTIONS:['active','archived','deleted'],_AUTOINDEX:true},
        {_ALIAS:"_CREATED",_ID:33,_REQUIRED:true,_PROPTYPE:'date'},
        {_ALIAS:"TAGS",_ID:34,_PROPTYPE:'pickList',_ISTYPE:[toBuffer(5)],_MANY:true,_DATATYPE:['set'],_VALUEIS:['nodeID'],_AUTOINDEX:true},
        {_ALIAS:"_IN",_ID:35,_PROPTYPE:'things',_DATATYPE:['set'],_VALUEIS:['nodeID']},
        {_ALIAS:"_OUT",_ID:36,_PROPTYPE:'things',_DATATYPE:['set'],_VALUEIS:['nodeID']},
        //src and trgt on relations
        {_ALIAS:"_SRC",_ID:37,_REQUIRED:true,_PROPTYPE:'thing',_DATATYPE:['nodeID']},
        {_ALIAS:"_TRGT",_ID:38,_REQUIRED:true,_PROPTYPE:'thing',_DATATYPE:['nodeID']},
        //Define props
        {_ALIAS:"_PROPTYPE",_ID:48,_PROPTYPE:'pickList',_DEFVAL:'data',_OPTIONS:validNodePropTypes},
        {_ALIAS:"_DATATYPE",_ID:49,_PROPTYPE:'pickList',_DEFVAL:['string'],_MANY:true,_DATATYPE:'array',_OPTIONS:validDataTypes},
        {_ALIAS:"_ENCODING",_ID:50,_PROPTYPE:'pickList',_DEFVAL:'utf8',_OPTIONS:validEncodings},
        {_ALIAS:"_KEYTEST",_ID:51,_PROPTYPE:'data',_DATATYPE:['function'],_DEFVAL:null},
        {_ALIAS:"_VALUETEST",_ID:52,_PROPTYPE:'data',_DATATYPE:['function'],_DEFVAL:null},
        {_ALIAS:"_HIDDEN",_ID:53,_DEFVAL:false,_DATATYPE:['boolean']},
        {_ALIAS:"_SORT",_ID:54,_DEFVAL:0,_DATATYPE:['number']},
        {_ALIAS:"_DEFVAL",_ID:55,_DEFVAL:null,_PROPTYPE:"data",_DATATYPE:validDataTypes},
        {_ALIAS:"_UNIQUE",_ID:56,_DEFVAL:false,_DATATYPE:['boolean']},
        {_ALIAS:"_FN",_ID:57,_DEFVAL:'',_PROPTYPE:"data",_DATATYPE:['function']},
        {_ALIAS:"_FORMAT",_ID:58,_DEFVAL:'',_PROPTYPE:"_FORMAT",_DATATYPE:['string','map']},
        {_ALIAS:"_OPTIONS",_ID:59,_DEFVAL:null,_PROPTYPE:"data",_DATATYPE:['array']},
        {_ALIAS:"_MANY",_ID:60,_DEFVAL:false,_DATATYPE:['boolean']},
        {_ALIAS:"_REQUIRED",_ID:61,_DEFVAL:false,_DATATYPE:['boolean']},
        {_ALIAS:"_INC",_ID:62,_DEFVAL:null,_PROPTYPE:"data",_DATATYPE:['array'],_VALUEIS:['number']},
        {_ALIAS:"_NEXTINC",_ID:63,_DATATYPE:['number','binary']},
        {_ALIAS:"_ISTYPE",_ID:64,_PROPTYPE:"data",_DATATYPE:['array'],_VALUEIS:['binary']},//tval of what the value (ival) of this prop should be a valid 'i' of.
        {_ALIAS:"_AUTOINDEX",_ID:65,_DEFVAL:null,_PROPTYPE:"pickList",_DATATYPE:['string','boolean'],_OPTIONS:['key','value',true,false]},//'key','value' only when DT = map
        {_ALIAS:"_KEYIS",_ID:66,_PROPTYPE:"pickList",_DEFVAL:null,_MANY:true,_DATATYPE:['array'],_OPTIONS:validDataTypes},//Alternative to KEY/VALUE TEST
        {_ALIAS:"_VALUEIS",_ID:67,_PROPTYPE:"pickList",_DEFVAL:null,_MANY:true,_DATATYPE:['array'],_OPTIONS:validDataTypes},
        {_ALIAS:"_VALUEISID",_ID:68,_PROPTYPE:"data",_DEFVAL:false,_DATATYPE:['boolean']},//only evaluated on map with a _FROM
        //Define thing
        {_ALIAS:"_XID",_ID:92,_UNIQUE:true,_DATATYPE:['string','number','binary']},
        {_ALIAS:"_HID",_ID:93,_PROPTYPE:"data",_DATATYPE:['binary'],_ISTYPE:[toBuffer(0)]},
        {_ALIAS:"_LOG",_ID:94,_DEFVAL:false,_DATATYPE:['boolean']},
        {_ALIAS:"_PROPS",_ID:95,_PROPTYPE:"data",_DATATYPE:['set'],_VALUEIS:['nodeID'],_ISTYPE:[toBuffer(0)]},//set of pval IDs
    ]
    let peerP = [
        {_ALIAS:"_SAID",_ID:128,_DATATYPE:'map'},
    ]
    let extP = [
        {_ALIAS:"_SAID",_ID:128,_DATATYPE:['map'],_KEYIS:['binary'],_VALUEIS:['binary'],_AUTOINDEX:'value'},

        {_ALIAS:"_PUBS",_ID:132,_DATATYPE:'map'},
        {_ALIAS:"_WKN",_ID:133,_DATATYPE:'array'},
        {_ALIAS:"_PEERS",_ID:134,_PROPTYPE:'linkTo',_OPTIONS:['PEERS'],_MANY:true,_DATATYPE:'map'},
        {_ALIAS:"_STMTS",_ID:135,_PROPTYPE:'linkTo',_OPTIONS:['_STMTS'],_MANY:true,_DATATYPE:'map'},
        {_ALIAS:"_TAIL",_ID:136,_DATATYPE:'array'},
        {_ALIAS:"PUBKEY",_ID:138,_DATATYPE:'array'},
        {_ALIAS:"_PREV",_ID:139,_DATATYPE:'array'},
        {_ALIAS:"WORK",_ID:140,_DATATYPE:'number'},
        {_ALIAS:"_HEADER",_ID:141,_DATATYPE:'array'},
    ]
    let classes = [
        {_ALIAS:'config',_ID:0,_REQPROPS:['_STATE']},
        {_ALIAS:'data',_ID:10,_REQPROPS:['_STATE','_CREATED','TAGS','_IN','_OUT']},
        {_ALIAS:'relation',_ID:20,_REQPROPS:['_STATE','_CREATED','TAGS','_SRC','_TRGT']},
        {_ALIAS:'file',_ID:30,_REQPROPS:['_STATE','_CREATED','TAGS','_IN','_OUT']},//TODO, figure out props for new classes of nodes...
        {_ALIAS:'repo',_ID:40,_REQPROPS:['_STATE','_CREATED','TAGS','_IN','_OUT']},
        {_ALIAS:'stream',_ID:50,_REQPROPS:['_STATE','_CREATED','TAGS','_IN','_OUT']}
    ]
    const TVALS={},PVALS={},CLASSES={}
    // ;(function(){
    //     for (const config of baseT) {
    //         let b64ID = intToBuff(config._ID).toString('base64');
    //         TVALS[config._ALIAS]=b64ID
    //     }
    //     for (const config of baseP) {
    //         let b64ID = intToBuff(config._ID,10).toString('base64');
    //         PVALS[config._ALIAS]=b64ID
    //     }
    //     for (const config of classes) {
    //         let b64ID = intToBuff(config._ID,4).toString('base64');
    //         CLASSES[config._ALIAS]=b64ID
    //     }
    // })()


    sg.newPID = async function(work){
        if(!root.peer.isPeer)return {pid:root.aegis.random(8)}
        let {ct,iv} = await root.monarch.pow(null,{target:work||24,all:true,contUpdateCB:root.opt.debug,updateEvery:1000000})
        console.log('CT:',[...ct])
        let pid = ct.slice(ct.length-16-16,ct.length-16).reverse()
        return {pid,iv}
    }
    sg.makePID = async function(iv,opt){
        opt = opt || {}
        let {diffHit,ct} = await root.monarch.checkPow(null,iv,{all:true})
        let pid = ct.slice(ct.length-16-16,ct.length-16).reverse()
        if(opt.all)return {pid,diffHit}
        return pid
    }
    //sg interacts with store directly?
    //if we are making local calls we should batch?

    sg.graphPut = function(nodeID,putObj,opts,cb){
        //if we own: check, index, alter refs, etc. then 

    }
    sg.put = function(gAddr,val,cb,txn){
        root.store.putKey(gAddr,val,cb,txn)
    }

    sg.read = function(gAddr,cb,txn){
        root.store.getKey(gAddr,cb,txn)
    }
    sg.delete = function(gAddr,cb,txn){
        root.store.delKey(gAddr,cb,txn)
    }

    sg.query = function(cid, qArr, sub){

    }
    sg.writes = new RWBatch()
    // sg.reads = new RBatch()
    // sg.deletes = new DBatch()
    function RWBatch(){
        let self = this
        this.state = true 
        this.buffer = []
        this.done = function(){
            let b = self.buffer.slice()
            self.buffer = []
            let txn = root.store.disk && root.store.disk.rwTxn()
            for (const args of b) {
                root.store.putKey(...args,txn)
            }
            if(txn && openedTxn){txn.commit()}
            self.state = true
            if(self.onFlush instanceof Function)self.onFlush(b)
        }
        //only runs the following when needing network request
        this.add = function(id,val,cb){
            if(self.state){
                self.state = false
                setTimeout(self.done,1)
            }
            self.buffer.push([id,val,cb])
        }
        
    }
}