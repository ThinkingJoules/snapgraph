

export default function User(root){
    let user = this

    user.signUp = async function(wkn,password,cb,opt){//create a new aeon identity
        opt = opt || {}
        let keys = opt.keys || [null]
        let proof = opt.proof || {}
        let pair = await root.aegis.pair()
        let chainID = await root.aegis.hash(pair.pub)
        if(root.user)throw new Error('You must logout before creating a new identity')
        root.user = {cid:chainID}




    }
    user.signIn = async function(auth){//auth this instance with aeon keys (or remote login)
        let {wkn,password,key} = auth

    }
    user.addKeys = async function(keysArr){//add n keys in a new authUpdate msg
        //to make key obj's
    }
    user.addWKN = async function(namesArr){
        //name, target proof
    }
}