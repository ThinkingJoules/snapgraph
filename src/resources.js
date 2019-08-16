import { setValue, getValue } from "./util";


export default function ResourceManager(root){
    let self = this
    this.list = {} //{baseID: {pending,peers,connected}}


    //tracks state of what baseID's we can reach
    //tracks pending requests that need a connection
    this.findResource = function(baseID){
        //make id from base


        root.get(id,function(node){

            //how are they updated <<sub scription we setup here
            //how to we get them the first time <<root.router.route.ask  
    
    
        })
    }
    this.addPendingMsg = function(baseID,taskfn){
        let pend = getValue([baseID,'pending'],self.list)
        if(!pend)setValue([baseID,'pending'],[taskfn],self.list)
        else pend.push(taskfn)
    }
}