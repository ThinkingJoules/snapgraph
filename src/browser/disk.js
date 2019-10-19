import localforage from 'localforage'
import {encode,decode} from '../util'
export default function WebStore(root){
    //localForage adapter for browsers
    localforage.ready().then(function() {
        console.log('Browser is storing data in:',localforage.driver());
    }).catch(function (e) {
        console.log('Browser is NOT storing data (error):',e);
    });
    this.rTxn = function(nameSpace){
        return {
            get,
            commit: function(){},
            abort: function(){}
        }
    }
    this.rwTxn = function(nameSpace){
        return {
            get,
            put,
            del,
            commit: function(){},
            abort: function(){}
        }
    }
    function get(key,cb){
        localforage.getItem(key.toString('binary'),function(err,value){
            if(cb instanceof Function)cb(err,value?decode(value):value)
        })  
    }
    function put(key,value,cb){
        localforage.setItem(key.toString('binary'),encode(value,true,true),cb)
    }
    function del(key,cb){
        localforage.removeItem(key.toString('binary'),cb)  
    }
}