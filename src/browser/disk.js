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
    async function get(key,cb){
        try {
            let data = await localforage.getItem(key.toString('binary'))
            if(cb instanceof Function)cb(false,data?decode(data):data)
            return data  
        } catch (error) {
            if(cb instanceof Function)cb(error)
            throw error
        }
    }
    async function put(key,value,cb){
        try {
            let data = await localforage.setItem(key.toString('binary'),encode(value,true,true))
            if(cb instanceof Function)cb(false,data)
            return data  
        } catch (error) {
            if(cb instanceof Function)cb(error)
            throw error
        }
    }
    async function del(key,cb){
        try {
            let data = await localforage.removeItem(key.toString('binary'))
            if(cb instanceof Function)cb(false,data)
            return data  
        } catch (error) {
            if(cb instanceof Function)cb(error)
            throw error
        }
          
    }
}