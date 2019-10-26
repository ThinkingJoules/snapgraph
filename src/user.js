

export default function User(root){
    let user = this

    user.signUp = async function(wkn,password,cb,opt){//create a new monarch identity
        opt = opt || {}
        let proof = opt.proof || {}
        if(root.user)throw new Error('You must logout before creating a new identity')
        let {authCreds,pair,msg,cid} = await root.monarch.create(password,{target:proof.identity})
        root.user = {cid,pub:pair.pub}




    }
    user.signIn = async function(auth){//auth this instance with monarch keys (or remote login)
        let {wkn,password,key} = auth

    }
    user.addKeys = async function(keysArr){//add n keys in a new authUpdate msg
        //to make key obj's
    }
    user.addWKN = async function(namesArr){
        //name, target proof
    }
}