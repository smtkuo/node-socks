var net = require('net'),
    util = require('util'),
    log = console.log,
    info = console.info,
    errorLog = console.error,
    clients = [],
    ips=[],
    SOCKS_VERSION = 4;
var fs = require("fs");
function createSocksServer(opts){
	opts = opts ? opts: {}
	var PORT4 = opts.port || '9999',		
		server4 = startSocksServer(opts);
    server4.on('error', function(e) {
      console.error('SERVER ERROR: %j', e);
      if (e.code == 'EADDRINUSE') {
        console.log('Address in use, retrying in 10 seconds...');
        setTimeout(function() {
          console.log('Reconnecting to %s', PORT);
          server.close();
          server.listen(PORT4);
        }, 10000);
      }
    });
    server4.listen(PORT4);
}
function startSocksServer(opts) {
	var cbuserpass = opts.authorization, fileBannedIPs = opts.fileBannedIPs
    var socksServer = net.createServer();
	if(fileBannedIPs){
		initIplist(fileBannedIPs);
		fs.watch(fileBannedIPs,function(event,filename){
			if(event=="change")
			{
				initIplist(fileBannedIPs);
			}
		});
	}
    socksServer.on('listening', function() {
        var address = socksServer.address();
        info('LISTENING %s:%s', address.address, address.port);
    });
    socksServer.on('connection', function(socket) {
        info('CONNECTED from  %s:%s', socket.remoteAddress, socket.remotePort);
        var idx = ips.indexOf(socket.remoteAddress);
        if (idx != -1) {
            socket.end();
            log('ip pass failed ');
        }else{
            initSocksConnection.bind(socket)(cbuserpass);
        }
    });
    return socksServer;
}
//iplist
function initIplist(fileBannedIPs) {
    fs.readFile(fileBannedIPs,function(err,data){
        if(err) throw err;
        ips = data.toString('utf8',0,data.length).split(";");
    });
}

// socket is available as this
function initSocksConnection(cbuserpass) {
    // keep log of connected clients
    clients.push(this);

    // remove from clients on disconnect
    this.on('end', function() {
        var idx = clients.indexOf(this);
        if (idx != -1) {
            clients.splice(idx, 1);
        }
    });
	
	this.cbuserpass = cbuserpass

    // do a handshake
    this.handshake = handshake.bind(this);
    this.on('data', this.handshake);
}

function handshake(chunk) {
    this.removeListener('data', this.handshake);

    // SOCKS Version 4 is the only support version
    if (chunk[0] != SOCKS_VERSION) {
        errorLog('handshake: wrong socks version: %d', chunk[0]);
        this.end();
    }

    var cmd=chunk[1],
        address,
        port,
        offset=3,
		userid;

    port = chunk.readUInt16BE(2);
	//////////////////socks4a support
    if(chunk[4]==0&&chunk[5]==0&&chunk[6]==0&&chunk[7]!=0){
        var ad = chunk.toString('utf8',8,chunk.length-1).split("\0");
        userid=ad[0];
        address=ad[1];        
    } else{
		userid = chunk.toString('utf8',8,chunk.length-1);
        address = util.format('%s.%s.%s.%s', chunk[offset+1], chunk[offset+2], chunk[offset+3], chunk[offset+4]);
    }
	log(userid+"--userid--");
	if(this.cbuserpass && !this.cbuserpass(userid)){
		var resp = new Buffer(8);		
		// rewrite response header
		resp[0] = 0x00;
		resp[1] = 93;
		this.write(resp);
		return
	}
	//log(address+"--address--");
    this.request = chunk;
    this.proxy = net.createConnection(port, address, initProxy.bind(this));
    this.proxy.on('error', function(had_error) {
        this.end();
        console.error('The Connection proxy error');
    }.bind(this));

}

function initProxy() {
    log('Proxy connected');
    // creating response
    var resp = new Buffer(8);
    this.request.copy(resp,0,0,7);
    // rewrite response header
    resp[0] = 0x00;
    resp[1] = 90;
    this.write(resp);

    var from_proxy = function(data) {
        try {
            this.write(data);
        } catch (err) {
        }
    }.bind(this);
    var to_proxy = function(data) {
        try {
            this.proxy.write(data);
        } catch (err) {
        }
    }.bind(this);

    this.proxy.on('data', from_proxy);
    this.on('data', to_proxy);

    this.proxy.on('end', function(had_error) {
        this.removeListener('data', to_proxy);
        this.proxy = undefined;
        this.end();
        //     errorLog('Proxy closed');
    }.bind(this));
    this.on('end', function(had_error) {
        if (this.proxy !== undefined) {
            this.proxy.removeListener('data', from_proxy);
            this.proxy.end();
        }
        //    errorLog('Socket closed');
    }.bind(this));
    this.on('error', function(had_error) {
        if (this.proxy !== undefined) {
            this.proxy.removeAllListeners('data');
            this.proxy.destroy();

        }
//console.error('The application error');

    }.bind(this));

    this.proxy.on('error', function(had_error) {
        this.destroy();
//console.error('The proxy error');
    }.bind(this));

    this.setTimeout(60000, function(error){
        if (this.proxy !== undefined) {
            this.proxy.removeAllListeners('data');
            this.proxy.end();

        }
        this.end();
        console.error('socket timeout 60000ms');

    }.bind(this));

    this.proxy.setTimeout(60000, function(error){
        this.proxy.removeAllListeners('data');
        this.proxy.end();
        this.end();
        console.error(' proxy socket timeout 60000ms');

    }.bind(this));

}

module.exports = {
    createServer: createSocksServer
};
