const fs = require('fs');
const config = { port: process.env.OPENSHIFT_NODEJS_PORT || process.env.VCAP_APP_PORT || process.env.PORT || process.argv[2] || 8765 };
const Snap = require('../dist/snap.cjs');

let http
const requestHandler = (req, res) => {
    if(req.url === "/dist/snap.umd.js"){
        res.writeHead(200, {'Content-Type': 'text/javascript'});
        res.end(fs.readFileSync(__dirname + '/../dist/snap.umd.js'))
    }else{
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write('<script src="../dist/snap.umd.js"></script>');
        res.end();
    }
}

if(process.env.HTTPS_KEY){
    config.key = fs.readFileSync(process.env.HTTPS_KEY);
    config.cert = fs.readFileSync(process.env.HTTPS_CERT);
    http = require('https')
    config.server = http.createServer(config);
} else {
    http = require('http')
    config.server = http.createServer(requestHandler);
}
const snap = Snap(false,{web: config.server.listen(config.port),dir:__dirname.split('/').slice(0,-1).join('/')+'/DATA'})//should put data in DATA folder in main repo area?

console.log('Snapgraph peer started on ' + config.port + ' with /snap');
