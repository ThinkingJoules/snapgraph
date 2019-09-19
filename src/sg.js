import { toBuffer } from "./util"

export default function SG(root){
    const validEncodings = ['ascii','utf8','uft16le','hex','base64','latin1'] //for Buffer.from( ,encoding)
    const validDataTypes = ["string", "number", "boolean", "array","set","map","binary","nodeID","address","function"] //binary and map are handled internally
    //const validStructures = ["id","nodeID","address"]
    const validNodePropTypes = ["data", "date", "pickList","function","linkTo","thing","things"]

    let baseT = [
        {_ALIAS:"_PROPS",_ID:0,_CLASS:'data',_PROPS:['_ALIAS','_STATE','_ID',"_PROPTYPE","_DATATYPE","_HIDDEN","_SORT","_DEFVAL","_UNIQUE","_FN","_FORMAT","_OPTIONS","_MANY","_REQUIRED","_CONTEXT","_FROM","_INC","_NEXTINC",]},
        {_ALIAS:"_THINGS",_ID:1,_PROPS:['_ALIAS','_STATE','_ID','_PROPS','_HID','_LOG','_ACTIVE','_ARCHIVED','_CLASS'],_CLASS:'data'},
        {_ALIAS:"_INDEXES",_ID:2,_PROPS:['_STATE','_TYPE','_PROP','_VALUE','_TEST','_LIST']},
        {_ALIAS:"_IoI",_ID:3,_CLASS:'data',_PROPS:['_STATE','_TYPE','_PROP','_INDEXES']},

    ]
    let extT = [
        //Core Ts
        
        {_ALIAS:"_CLASSES",_ID:18,_PROPS:['_ALIAS','_STATE','_ID','_REQPROPS']},
        //Supporting T's
        {_ALIAS:"TAGS",_ID:32,_CLASS:'data',_PROPS:['_ID','_STATE','_ALIAS','_HASTAG']},
        {_ALIAS:"PEOPLE",_ID:33,_CLASS:'data',_PROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT','_PUBS','_PEERS','_WKN','_SAID','_STMTS','_TAIL']},
        {_ALIAS:"STMTS",_ID:34,_CLASS:'data',_PROPS:['_STATE','_CREATED','_TAGS','PUBKEY','_PREV','WORK','_HEADER']},
        {_ALIAS:"PEERS",_ID:35,_CLASS:'data',_PROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']},
        {_ALIAS:"SUBNET",_ID:36,_CLASS:'data',_PROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']}
    ]
    let baseP = [
        //ID for t and p vals
        {_ALIAS:"_ID",_ID:0,_REQUIRED:true,_PROPTYPE:'data',_DATATYPE:'binary',_UNIQUE:true,_INC:[1,toBuffer(1000)]},
        //Alias for t and p vals
        {_ALIAS:"_ALIAS",_ID:4,_REQUIRED:true,_UNIQUE:true},
        //Index Building
        {_ALIAS:"_TYPE",_ID:16,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:'binary',_CONTEXT:1,_FROM:[toBuffer(1)]},
        {_ALIAS:"_PROP",_ID:17,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:'binary',_CONTEXT:0,_FROM:[toBuffer(0)]},
        {_ALIAS:"_TEST",_ID:18,_DATATYPE:'function'},
        {_ALIAS:"_VALUE",_ID:19,_REQUIRED:true,_PROPTYPE:"data",_DATATYPE:['string','number','binary','boolean']},
        {_ALIAS:"_LIST",_ID:20,_PROPTYPE:'things',_DATATYPE:'map',_KEYTEST:'ISNODEID(x)',_VALUETEST:'OR(ISSTRING(x),ISNUMBER(x),ISBINARY(x),ISBOOLEAN(x))'},
        //IoI Building
        {_ALIAS:"_INDEXES",_ID:21,_PROPTYPE:'things',_DATATYPE:'map',_KEYTEST:'ISNODEID(x)',_VALUETEST:'OR(ISSTRING(x),ISNUMBER(x),ISBINARY(x),ISBOOLEAN(x))'},
        //Counter
        //Props on all nodes
        {_ALIAS:"_STATE",_ID:32,_REQUIRED:true,_PROPTYPE:'pickList',_DEFVAL:'active',_OPTIONS:['active','archived','deleted'],_AUTOINDEX:true},
        {_ALIAS:"_CREATED",_ID:33,_REQUIRED:true,_PROPTYPE:'date'},
        {_ALIAS:"_TAGS",_ID:34,_PROPTYPE:'pickList',_CONTEXT:1,_FROM:[toBuffer(32)],_MANY:true,_DATATYPE:'set',_VALUETEST:'ISNODEID(x)'},
        {_ALIAS:"_IN",_ID:35,_PROPTYPE:'things',_DATATYPE:'set',_VALUETEST:'ISNODEID(x)'},
        {_ALIAS:"_OUT",_ID:36,_PROPTYPE:'things',_DATATYPE:'set',_VALUETEST:'ISNODEID(x)'},
        //src and trgt on relations
        {_ALIAS:"_SRC",_ID:37,_REQUIRED:true,_PROPTYPE:'thing',_DATATYPE:'nodeID'},
        {_ALIAS:"_TRGT",_ID:38,_REQUIRED:true,_PROPTYPE:'thing',_DATATYPE:'nodeID'},
        //Define props
        {_ALIAS:"_PROPTYPE",_ID:48,_PROPTYPE:'pickList',_DEFVAL:'data',_OPTIONS:validNodePropTypes},
        {_ALIAS:"_DATATYPE",_ID:49,_PROPTYPE:'pickList',_DEFVAL:'string',_OPTIONS:validDataTypes},
        {_ALIAS:"_ENCODING",_ID:50,_PROPTYPE:'pickList',_DEFVAL:'utf8',_OPTIONS:validEncodings},
        {_ALIAS:"_KEYTEST",_ID:51,_PROPTYPE:'data',_DATATYPE:'function',_DEFVAL:false},
        {_ALIAS:"_VALUETEST",_ID:52,_PROPTYPE:'data',_DATATYPE:'function',_DEFVAL:false},
        {_ALIAS:"_HIDDEN",_ID:53,_DEFVAL:false,_DATATYPE:'boolean'},
        {_ALIAS:"_SORT",_ID:54,_DEFVAL:0,_DATATYPE:'number'},
        {_ALIAS:"_DEFVAL",_ID:55,_DEFVAL:null,_PROPTYPE:"data",_DATATYPE:validDataTypes},
        {_ALIAS:"_UNIQUE",_ID:56,_DEFVAL:false,_DATATYPE:'boolean'},
        {_ALIAS:"_FN",_ID:57,_DEFVAL:'',_PROPTYPE:"data",_DATATYPE:'function'},
        {_ALIAS:"_FORMAT",_ID:58,_DEFVAL:'',_PROPTYPE:"_FORMAT",_DATATYPE:['string','map']},
        {_ALIAS:"_OPTIONS",_ID:59,_DEFVAL:false,_PROPTYPE:"data",_DATATYPE:'array'},
        {_ALIAS:"_MANY",_ID:60,_DEFVAL:false,_DATATYPE:'boolean'},
        {_ALIAS:"_REQUIRED",_ID:61,_DEFVAL:false,_DATATYPE:'boolean'},
        {_ALIAS:"_INC",_ID:62,_DEFVAL:false,_PROPTYPE:"data",_DATATYPE:'array',_VALUETEST:'ISNUMBER(x)'},
        {_ALIAS:"_FROM",_ID:63,_PROPTYPE:"data",_DATATYPE:'array',_VALUETEST:'ISBINARY(x)'},//set of IDs of (_CONTEXT)
        {_ALIAS:"_CONTEXT",_ID:64,_PROPTYPE:"pickList",_DATATYPE:'number',_OPTIONS:[0,1]},//tval for props(0) or things(1)
        {_ALIAS:"_AUTOINDEX",_ID:65,_DEFVAL:false,_PROPTYPE:"data",_DATATYPE:'boolean'},
        {_ALIAS:"_NEXTINC",_ID:66,_DATATYPE:['number','binary']},
        //Define thing
        {_ALIAS:"_XID",_ID:92,_UNIQUE:true,_DATATYPE:['string','number']},
        {_ALIAS:"_HID",_ID:93,_PROPTYPE:"data",_DATATYPE:'binary'},
        {_ALIAS:"_LOG",_ID:94,_DEFVAL:false,_DATATYPE:'boolean'},
        {_ALIAS:"_PROPS",_ID:95,_PROPTYPE:"data",_DATATYPE:'set',_VALUETEST:'ISBINARY(x)'},//set of pval IDs
    ]
    let extP = [
        {_ALIAS:"_TYPE",_ID:128,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:'binary',_CONTEXT:1,_FROM:[toBuffer(1)]},
        {_ALIAS:"_PROP",_ID:129,_REQUIRED:true,_PROPTYPE:"pickList",_DATATYPE:'binary',_CONTEXT:0,_FROM:[toBuffer(0)]},
        {_ALIAS:"_CLASS",_ID:130,_PROPTYPE:"pickList",_DATATYPE:'nodeID',_CONTEXT:1,_FROM:[toBuffer(18)]},
        {_ALIAS:"_REQPROPS",_ID:131,_DATATYPE:'array'},
        {_ALIAS:"_PUBS",_ID:132,_DATATYPE:'map'},
        {_ALIAS:"_WKN",_ID:133,_DATATYPE:'array'},
        {_ALIAS:"_PEERS",_ID:134,_PROPTYPE:'linkTo',_OPTIONS:['PEERS'],_MANY:true,_DATATYPE:'map'},
        {_ALIAS:"_STMTS",_ID:135,_PROPTYPE:'linkTo',_OPTIONS:['_STMTS'],_MANY:true,_DATATYPE:'map'},
        {_ALIAS:"_TAIL",_ID:136,_DATATYPE:'array'},
        {_ALIAS:"_HASTAG",_ID:137,_DATATYPE:'map'},
        {_ALIAS:"PUBKEY",_ID:138,_DATATYPE:'array'},
        {_ALIAS:"_PREV",_ID:139,_DATATYPE:'array'},
        {_ALIAS:"WORK",_ID:140,_DATATYPE:'number'},
        {_ALIAS:"_HEADER",_ID:141,_DATATYPE:'array'},
        {_ALIAS:"_SAID",_ID:142,_DATATYPE:'map'},
    ]
    let indexes = [
        {_TYPE:toBuffer(0),_PROP:toBuffer(32),TEST:'x = active'},//active props
        {_TYPE:toBuffer(0),_PROP:toBuffer(32),TEST:'x = archived'},//archived props
        {_TYPE:toBuffer(1),_PROP:toBuffer(32),TEST:'x = active'},//things
        {_TYPE:toBuffer(1),_PROP:toBuffer(32),TEST:'x = archived'},
        {_TYPE:toBuffer(2),_PROP:toBuffer(32),TEST:'x = active'},//indexes (this)
        {_TYPE:toBuffer(2),_PROP:toBuffer(32),TEST:'x = archived'},
        {_TYPE:toBuffer(3),_PROP:toBuffer(32),TEST:'x = active'},//IoI
        {_TYPE:toBuffer(3),_PROP:toBuffer(32),TEST:'x = archived'},
    ]
    let classes = [
        {_ALIAS:'data',_ID:0,_REQPROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']},
        {_ALIAS:'relation',_ID:1,_REQPROPS:['_STATE','_CREATED','_TAGS','_SRC','_TRGT']},
        {_ALIAS:'file',_ID:2,_REQPROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']},//TODO, figure out props for new classes of nodes...
        {_ALIAS:'repo',_ID:3,_REQPROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']},
        {_ALIAS:'stream',_ID:4,_REQPROPS:['_STATE','_CREATED','_TAGS','_IN','_OUT']}
    ]
    const TVALS={},PVALS={},CLASSES={}
    ;(function(){
        for (const config of baseT) {
            let b64ID = intToBuff(config._ID).toString('base64');
            TVALS[config._ALIAS]=b64ID
        }
        for (const config of baseP) {
            let b64ID = intToBuff(config._ID,10).toString('base64');
            PVALS[config._ALIAS]=b64ID
        }
        for (const config of classes) {
            let b64ID = intToBuff(config._ID,4).toString('base64');
            CLASSES[config._ALIAS]=b64ID
        }
    })()
}