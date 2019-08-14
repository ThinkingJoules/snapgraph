import Gun from 'gun'
import SEA from 'gun/sea'
import {getValue,setValue} from '../util'


export const create = function(alias, pass, cb){
    let snap = this
    let root = snap._
    let cat = getValue(['state','cat'], root) || {}
    cb = cb || noop;
    if(cat.ing){
      cb({err: root.opt.log("User is already being created or authenticated!")});
    }
    root.util.setValue(['state','cat','ing'],true,root);
    var act = {}, u;
    act.a = function(pubs){
        if(pubs){//must be online/connected to mainnet to create a userID
            // If we can enforce that a user name is already taken, it might be nice to try, but this is not guaranteed.
            var ack = {err: Gun.log('User already created!')};
            cat.ing = false;
            cb(ack);
            return;
        }
        act.pubs = pubs;
        act.salt = Gun.text.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
        SEA.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
    }
    act.b = function(proof){
        act.proof = proof;
        SEA.pair(act.c); // now we have generated a brand new ECDSA key pair for the user account.
    }
    act.c = function(pair){ 
        let tmp = {}
        act.pair = pair || {};
        tmp.is = {pub: pair.pub, epub: pair.epub, alias: alias};
        // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
        act.data = {pub: pair.pub};
        act.data.alias = alias;
        act.data.epub = act.pair.epub; 
        SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, act.proof, act.g, {raw:1}); // to keep the private key safe, we AES encrypt it with the proof of work!
    }
    act.g = function(auth){ var tmp;
        act.data.auth = JSON.stringify({ek: auth, s: act.salt}); 
        root.opt.debug('SUCCESSFUL USER CREATION!',act)

        //want to gossip this, and wait for one ack until we fire the auth event


        root.sign = sign(act.pair)
        root.user = {pub: act.pair.pub,alias:act.data.alias}
        root.util.setValue(['state','cat','ing'],false,root);
        root.on.auth(act.pair.pub)
        //root.get(tmp = '~'+act.pair.pub).put(act.data); // awesome, now we can actually save the user with their public key as their ID.
        //root.get('~@'+alias).put(Gun.obj.put({}, tmp, Gun.val.link.ify(tmp))); // next up, we want to associate the alias with the public key. So we add it to the alias list.
        
    }
    act.a(null)
    //root.get('~@'+alias).once(act.a);
    return
}
export const leave = function(){
    let snap = this
    let root = snap._
    root.on.signout()
}
export const auth = function(alias, pass, cb, opt){
    let snap = this
    let root = snap._
    let cat = getValue(['state','cat'], root) || {}
    cb = cb || function(){};
    if(cat.ing){
    cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
    return gun;
    }
    root.util.setValue(['state','cat','ing'],true,root);
    opt = opt || {};
    var pair = (alias && (alias.pub || alias.epub))? alias : (pass && (pass.pub || pass.epub))? pass : null;
    var act = {}, u;
    act.a = function(data){
        if(!data){ return act.b() }
        if(!data.pub){
            var tmp = [];
            Gun.node.is(data, function(v){ tmp.push(v) })
            return act.b(tmp);
        }
        if(act.name){ return act.f(data) }
        act.c((act.data = data).auth); //this sets data.pub a>map>b>getsSoul2>c>ifFail start over
    }
    act.b = function(list){
        var get = (act.list = (act.list||[]).concat(list||[])).shift();
        if(u === get){
            if(act.name){ return act.err('Your user account is not published for dApps to access, please consider syncing it online, or allowing local access by adding your device as a peer.') }
            return act.err('Wrong user or password.') 
        }
        root.ask(get,false,act.a)
    }
    act.c = function(auth){
        if(u === auth){ return act.b() }
        SEA.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
    }
    act.d = function(proof){
        SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
    }
    act.e = function(half){
        if(u === half){
            act.enc = null; // end backwards
            return act.b();
        }
        act.half = half;
        act.f(act.data);
    }
    act.f = function(data){
        if(!data || !data.pub){ return act.b() }
        var tmp = act.half || {};
        act.g({pub: data.pub, epub: data.epub, priv: tmp.priv, epriv: tmp.epriv});
    }
    act.g = function(pair){
        act.pair = pair;
        opt.change? act.z() : done();
    }
    act.z = function(){
        // password update so encrypt private key using new pwd + salt
        act.salt = Gun.text.random(64); // pseudo-random
        SEA.work(opt.change, act.salt, act.y);
    }
    act.y = function(proof){
        SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, proof, act.x, {raw:1});
    }
    act.x = function(auth){
        act.w(JSON.stringify({ek: auth, s: act.salt}));
    }
    act.w = function(auth){
        //root.get('~'+act.pair.pub).get('auth').put(auth, cb);
    }
    act.err = function(e){
        var ack = {err: Gun.log(e || 'User cannot be found!')};
        cat.ing = false;
        cb(ack);
    }
    if(pair){
        act.g(pair);
    } else
    if(alias){
        root.get('~@'+alias).once(act.a);
    } else
    if(!alias && !pass){
        act.err('NOT SURE!!')
    }
    function done(){
        root.sign = sign(act.pair)
        root.user = {pub: data.pub,alias}
        root.util.setValue(['state','cat','ing'],false,root);
        root.on.auth()
        cb(false,data.pub)
    }
}
function user(snap){
    const user = function(){}
    let root = snap._
    snap.create = function(alias, pass, cb, opt){
        let cat = getValue(['state','cat'], root) || {}
        cb = cb || noop;
        if(cat.ing){
          cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
          return gun;
        }
        setValue(['state','cat','ing'],true,root);
        opt = opt || {};
        var act = {}, u;
        act.a = function(pubs){
            if(pubs){//must be online/connected to mainnet to create a userID
                // If we can enforce that a user name is already taken, it might be nice to try, but this is not guaranteed.
                var ack = {err: Gun.log('User already created!')};
                cat.ing = false;
                cb(ack);
                return;
            }
            act.pubs = pubs;
            act.salt = Gun.text.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
            SEA.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
        }
        act.b = function(proof){
            act.proof = proof;
            SEA.pair(act.c); // now we have generated a brand new ECDSA key pair for the user account.
        }
        act.c = function(pair){ var tmp;
            act.pair = pair || {};
            tmp.is = {pub: pair.pub, epub: pair.epub, alias: alias};
            // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
            act.data = {pub: pair.pub};
            act.data.alias = alias;
            act.data.epub = act.pair.epub; 
            SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, act.proof, act.g, {raw:1}); // to keep the private key safe, we AES encrypt it with the proof of work!
        }
        act.g = function(auth){ var tmp;
            act.data.auth = JSON.stringify({ek: auth, s: act.salt}); 
            root.get(tmp = '~'+act.pair.pub).put(act.data); // awesome, now we can actually save the user with their public key as their ID.
            root.get('~@'+alias).put(Gun.obj.put({}, tmp, Gun.val.link.ify(tmp))); // next up, we want to associate the alias with the public key. So we add it to the alias list.
            setTimeout(function(){ // we should be able to delete this now, right?
            cat.ing = false;
            cb({ok: 0, pub: act.pair.pub}); // callback that the user has been created. (Note: ok = 0 because we didn't wait for disk to ack)
            if(noop === cb){ gun.auth(alias, pass) } // if no callback is passed, auto-login after signing up.
            },10);
        }
        //root.get('~@'+alias).once(act.a);
        return gun;
        }
    user.auth = function(alias, pass, cb, opt){
        let cat = getValue(['state','cat'], root) || {}
        cb = cb || function(){};
        if(cat.ing){
        cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
        return gun;
        }
        setValue(['state','cat','ing'],true,root);
        opt = opt || {};
        var pair = (alias && (alias.pub || alias.epub))? alias : (pass && (pass.pub || pass.epub))? pass : null;
        var act = {}, u;
        act.a = function(data){
            if(!data){ return act.b() }
            if(!data.pub){
                var tmp = [];
                Gun.node.is(data, function(v){ tmp.push(v) })
                return act.b(tmp);
            }
            if(act.name){ return act.f(data) }
            act.c((act.data = data).auth); //this sets data.pub a>map>b>getsSoul2>c>ifFail start over
        }
        act.b = function(list){
            var get = (act.list = (act.list||[]).concat(list||[])).shift();
            if(u === get){
                if(act.name){ return act.err('Your user account is not published for dApps to access, please consider syncing it online, or allowing local access by adding your device as a peer.') }
                return act.err('Wrong user or password.') 
            }
            root.ask(get,false,act.a)
        }
        act.c = function(auth){
            if(u === auth){ return act.b() }
            SEA.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
        }
        act.d = function(proof){
            SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
        }
        act.e = function(half){
            if(u === half){
                act.enc = null; // end backwards
                return act.b();
            }
            act.half = half;
            act.f(act.data);
        }
        act.f = function(data){
            if(!data || !data.pub){ return act.b() }
            var tmp = act.half || {};
            act.g({pub: data.pub, epub: data.epub, priv: tmp.priv, epriv: tmp.epriv});
        }
        act.g = function(pair){
            act.pair = pair;
            opt.change? act.z() : done(act.pair);
        }
        act.z = function(){
            // password update so encrypt private key using new pwd + salt
            act.salt = Gun.text.random(64); // pseudo-random
            SEA.work(opt.change, act.salt, act.y);
        }
        act.y = function(proof){
            SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, proof, act.x, {raw:1});
        }
        act.x = function(auth){
            act.w(JSON.stringify({ek: auth, s: act.salt}));
        }
        act.w = function(auth){
            //root.get('~'+act.pair.pub).get('auth').put(auth, cb);
        }
        act.err = function(e){
            var ack = {err: Gun.log(e || 'User cannot be found!')};
            cat.ing = false;
            cb(ack);
        }
        if(pair){
            act.g(pair);
        } else
        if(alias){
            root.get('~@'+alias).once(act.a);
        } else
        if(!alias && !pass){
            act.err('NOT SURE!!')
        }
        function done(pair){
            root.sign = sign(pair)
            root.verify = verify(pair)
            root.alias = alias
        }
    }
}
function sign(pair){
    return function(msg,cb){
        SEA.sign(msg,pair,cb)
    }
}
export const verify = function(msg,pub,cb){
    SEA.verify(msg,pub,cb)
}