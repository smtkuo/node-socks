var net = require('net'),
  dgram = require('dgram'),
  dns = require('dns'),
  util = require('util'),
  log = console.log,
  info = console.info,
  errorLog = console.error,
  clients = [],
  ips = [],
  SOCKS_VERSION = 5,
  /*
   * Authentication methods
   ************************
   * o  X'00' NO AUTHENTICATION REQUIRED
   * o  X'01' GSSAPI
   * o  X'02' USERNAME/PASSWORD
   * o  X'03' to X'7F' IANA ASSIGNED
   * o  X'80' to X'FE' RESERVED FOR PRIVATE METHODS
   * o  X'FF' NO ACCEPTABLE METHODS
   */
  AUTHENTICATION = {
    NOAUTH: 0x00,
    GSSAPI: 0x01,
    USERPASS: 0x02,
    NONE: 0xFF
  },
  /*
   * o  CMD
   *    o  CONNECT X'01'
   *    o  BIND X'02'
   *    o  UDP ASSOCIATE X'03'
   */
  REQUEST_CMD = {
    CONNECT: 0x01,
    BIND: 0x02,
    UDP_ASSOCIATE: 0x03
  },
  /*
   * o  ATYP   address type of following address
   *    o  IP V4 address: X'01'
   *    o  DOMAINNAME: X'03'
   *    o  IP V6 address: X'04'
   */
  ATYP = {
    IP_V4: 0x01,
    DNS: 0x03,
    IP_V6: 0x04
  },
  Address = {
    read: function(buffer, offset) {
      if (buffer[offset] == ATYP.IP_V4) {
        return util.format('%s.%s.%s.%s', buffer[offset + 1], buffer[offset + 2], buffer[offset + 3], buffer[offset + 4]);
      } else if (buffer[offset] == ATYP.DNS) {
        return buffer.toString('utf8', offset + 2, offset + 2 + buffer[offset + 1]);
      } else if (buffer[offset] == ATYP.IP_V6) {
        return buffer.slice(buffer[offset + 1], buffer[offset + 1 + 16]);
      }
    },
    sizeOf: function(buffer, offset) {
      if (buffer[offset] == ATYP.IP_V4) {
        return 4;
      } else if (buffer[offset] == ATYP.DNS) {
        return buffer[offset + 1] + 1;
      } else if (buffer[offset] == ATYP.IP_V6) {
        return 16;
      }
    }
  };
var fs = require("fs");

function createSocksServer(opts) {
  var defaultOpts = {
	  port: 8888,
	  timeout: 60000
  }	
  opts = Object.assign({}, defaultOpts, opts?opts:{});  
  var PORT5 = opts.port,
    server5 = initSocksServer(opts);

  server5.on('error', function(e) {
    console.error('SERVER ERROR: %j', e);
    if (e.code == 'EADDRINUSE') {
      console.log('Address in use, retrying in 10 seconds...');
      setTimeout(function() {
        console.log('Reconnecting to %s', PORT5);
        server5.close();
        server5.listen(PORT5);
      }, 10000);
    }
  });
  return server5.listen(PORT5);
}

function initSocksServer(opts) {
  var fileBannedIPs = opts.fileBannedIPs;
  var socksServer = net.createServer();

  if (fileBannedIPs) {
    initIplist(fileBannedIPs);
    fs.watch(fileBannedIPs, function(event, filename) {
      if (event == "change") //If the file changes
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
    info('CONNECTED %s:%s', socket.remoteAddress, socket.remotePort);

    var idx = ips.indexOf(socket.remoteAddress);
    if (idx != -1) {
      socket.end();
      log('ip pass failed ');
    } else {
      initSocksConnection.bind(socket)(opts);
    }
    
  });
  return socksServer;
}
//
//iplist
function initIplist(fileBannedIPs) {
  fs.readFile(fileBannedIPs, function(err, data) {
    if (err) throw err;
    ips = data.toString('utf8', 0, data.length).split(";");
  });
}

// socket is available as this
function initSocksConnection(opts) {
  // keep log of connected clients
  clients.push(this);

  this.opts = opts;

  // remove from clients on disconnect
  this.on('end', function() {
    var idx = clients.indexOf(this);
    if (idx != -1) {
      clients.splice(idx, 1);
    }
  });
  this.on('error', function(e) {
    errorLog('initSocksConnection error');
  });

  // do a handshake
  this.handshake = handshake.bind(this);
  this.on_accept = on_accept; // No bind. We want 'this' to be the server, like it would be for net.createServer
  this.on('data', this.handshake);
}

function handshake(chunk) {
  this.removeListener('data', this.handshake);

  var method_count = 0;

  // SOCKS Version 5 is the only support version
  if (chunk[0] != SOCKS_VERSION) {
    errorLog('handshake: wrong socks version: %d', chunk[0]);
    this.end();
  }
  // Number of authentication methods
  method_count = chunk[1];

  this.auth_methods = [];
  // i starts on 1, since we've read chunk 0 & 1 already
  for (var i = 2; i < method_count + 2; i++) {
    this.auth_methods.push(chunk[i]);
  }
  log('Supported auth methods: %j', this.auth_methods);

  var resp = Buffer.alloc(2);
  resp[0] = 0x05;

  if (this.auth_methods.indexOf(AUTHENTICATION.USERPASS) > -1) {
    log('USERPASS');
    this.handleRequest = handleRequest.bind(this);
    this.on('data', this.handleRequest);
    resp[1] = AUTHENTICATION.USERPASS;
    this.write(resp);
  } else
  if (!this.opts.authorization && this.auth_methods.indexOf(AUTHENTICATION.NOAUTH) > -1) {
    log('Handing off to handleRequest');
    this.handleRequest = handleRequest.bind(this);
    this.on('data', this.handleRequest);
    resp[1] = AUTHENTICATION.NOAUTH;
    this.write(resp);
  } else {
    errorLog('Unsuported authentication method -- disconnecting');
    resp[1] = 0xFF;
    this.end(resp);
  }
}

function handleRequest(chunk) {

  log('handleRequest chunk', chunk);

  this.removeListener('data', this.handleRequest);

  if (chunk[0] == 0x01) {
    var length1 = chunk[1],
      u = chunk.toString('utf8', 2, 2 + length1),
      length2 = chunk[length1 + 2],
      p = chunk.toString('utf8', length1 + 3, length1 + 3 + length2);

    var resp = Buffer.alloc(2);
    resp[0] = 0x01;
    if (this.opts.authorization && this.opts.authorization(u, p)) {
      resp[1] = 0x00;
    } else {
      resp[1] = 0x01;
    }
    this.handleRequest = handleRequest.bind(this);
    this.on('data', this.handleRequest);
    this.write(resp);
    return;
  }

  var cmd = chunk[1],
    address,
    port,
    offset = 3;
  // Wrong version!
  if (chunk[0] !== SOCKS_VERSION) {
    this.end('%d%d', 0x05, 0x01);
    errorLog('handleRequest: wrong socks version: %d', chunk[0]);
    log(chunk);
    return;
  }
  /*
    else if (chunk[2] == 0x00) {
  	 this.end(util.format('%d%d', 0x05, 0x01));
  	 errorLog('handleRequest: Mangled request. Reserved field is not null: %d', chunk[offset]);
  	 return;
    }*/
  address = Address.read(chunk, 3);
  offset = 4 + Address.sizeOf(chunk, 3);
  port = chunk.readUInt16BE(offset);

  log('Request: type: %d -- to: %s:%s; cmd: %d', chunk[1], address, port, cmd);

  if (cmd == REQUEST_CMD.CONNECT) {
    this.request = chunk;
    this.on_accept(this, port, address, proxyReady.bind(this));
  } else if (cmd == REQUEST_CMD.UDP_ASSOCIATE) {

    this.on('data', this.handleRequest);

    this.request = chunk;
    var client = this;
    this.udpclient = dgram.createSocket("udp4");

    this.udpclient.on('error', (err) => {
      console.log(`UDP server error:\n${err.stack}`);
      client.destroy();
    });
	
	this.udpclient.on('close', () => {
      console.log(`UDP server close`);
      client.destroy();	  
    });

    this.udpclient.on('listening', () => {
      const address = client.udpclient.address();
      console.log(`UDP server listening ${address.address}:${address.port}`);
    });

    this.udpclient.bind({
      port: 0,
      address: '127.0.0.1',
      exclusive: true
    }, function() {
      var udpaddress = client.udpclient.address();
      var resp = Buffer.alloc(chunk.length);
      chunk.copy(resp);
      // rewrite response header
      resp[0] = SOCKS_VERSION;
      resp[1] = 0x00;
      resp[2] = 0x00;
      var ad = udpaddress.address.split(".");
      resp[4] = Number(ad[0]);
      resp[5] = Number(ad[1]);
      resp[6] = Number(ad[2]);
      resp[7] = Number(ad[3]);
      resp.writeUInt16BE(udpaddress.port, 8);
      client.write(resp);
      client.clientaddress = address;
      client.clientport = port;
      client.udphandshake = udphandshake.bind(client);
      client.udpclient.on('message', client.udphandshake);
    });

  } else {
    this.end('%d%d', 0x05, 0x01);
    return;
  }
}

function proxyReady() {
  log('Indicating to the client that the proxy is ready');
  // creating response
  var resp = Buffer.alloc(this.request.length);
  this.request.copy(resp);
  // rewrite response header
  resp[0] = SOCKS_VERSION;
  resp[1] = 0x00;
  resp[2] = 0x00;
  this.write(resp);

  log('Connected to: %s:%d', Address.read(resp, 3), resp.readUInt16BE(resp.length - 2));

}

function udphandshake(msg, rinfo) { //console.log(msg,rinfo,rinfo.address , this.clientaddress, this.clientport)
  this.removeListener('message', this.udphandshake);
  //get the udp head
  if (rinfo.address == this.clientaddress && rinfo.port == this.clientport) { //Forward
    if (msg[3] == 1) {
      var address = Address.read(msg, 3),
        offset = 4 + Address.sizeOf(msg, 3),
        port = msg.readUInt16BE(offset);
      this.udpclient.send(msg, offset + 2, msg.length - offset - 2, port, address);
    } else if (msg[3] == 3) {
      var dnsaddress = Address.read(msg, 3),
        offset = 4 + Address.sizeOf(msg, 3),
        port = msg.readUInt16BE(offset),
        that = this;
      dns.lookup(dnsaddress, 4, function(err, address, family) {
        if (err) throw err;
        dnsaddress = address;
        that.udpclient.send(msg, offset + 2, msg.length - offset - 2, port, dnsaddress);
      });
    }
    this.on('message', this.udphandshake);
  } else { //Receive other information	
    var resp = Buffer.alloc(10 + msg.length);
    msg.copy(resp, 10);
    // rewrite response header
    resp[0] = 0x00;
    resp[1] = 0x00;
    resp[2] = 0x00;
    resp[3] = 0x01;
    var ad = rinfo.address.split(".");
    resp[4] = Number(ad[0]);
    resp[5] = Number(ad[1]);
    resp[6] = Number(ad[2]);
    resp[7] = Number(ad[3]);
    resp.writeUInt16BE(rinfo.port, 8);
    this.udpclient.send(resp, 0, resp.length, this.clientport, this.clientaddress);
  }
  this.udpclient.on('error', function() {});
  this.on('close', function(had_error) {
    this.end();
    try {
      this.udpclient.close();
    } catch (e) {
      console.log('Error close udpclient')
    }
  }.bind(this));
  this.on('error', function(had_error) {
    this.end();
    try { 	  
      this.udpclient.close();
    } catch (e) {
      console.log('Error close udpclient')
    }
  }.bind(this));

}

function on_accept(socket, port, address, proxy_ready) {
  console.log('Got through the first part of the SOCKS protocol.')

  let deny = function() {
      try {
        socket.end();
      } catch (e) {}
    },
    accept = function(v) {
	  if (typeof v == "undefined" && socket.opts.ssh) return false;	
      if (typeof v != "undefined" && !v) return false;

      console.log('createConnection')
      var proxy = net.createConnection(port, address, proxy_ready);

      proxy.on('end', function(had_error) {
        socket.end();
        console.error('The proxy closed');
      });

      socket.on('end', function(had_error) {
        if (proxy !== undefined) {
          proxy.removeAllListeners('data');
          proxy.end();
		  clearTimeout(ps)
        }
        console.error('The application closed');
      });

      socket.on('error', function(had_error) {
        if (proxy !== undefined) {
          proxy.removeAllListeners('data');
		  proxy.end();          
		  clearTimeout(ps)
        }		
		socket.destroy(); 
		clearTimeout(ss)
        console.error('The application error: %j', had_error);
      });

      proxy.on('error', function(had_error) {
		socket.end();  
        socket.destroy();
		clearTimeout(ss)
        console.error('The proxy error');
      });

      let ss = socket.setTimeout(socket.opts.timeout, function(error) {
        if (proxy !== undefined) {
          proxy.removeAllListeners('data');
          proxy.end();
        }		
        if (socket.end)
          socket.end();
        console.error(`socket timeout ${socket.opts.timeout}ms`);
      });

      let ps = proxy.setTimeout(socket.opts.timeout, function(error) {
        proxy.removeAllListeners('data');
        proxy.end();
        if (socket.end)
          socket.end();
        console.error(`proxy socket timeout ${socket.opts.timeout}ms`);
      });

      if (typeof v == "undefined" || (v !== 1 && v !== true))
        return socket.pipe(proxy).pipe(socket);
      else
        return proxy.pipe(socket);
    }
  if (socket.opts.onAccept) {
    var info = {
      srcAddr: socket.remoteAddress,
      srcPort: socket.remotePort,
      dstAddr: address,
      dstPort: port,
      numClients: clients.length
    }
    socket.opts.onAccept.call(null, socket, info, accept, deny)
  }
  if (socket.opts.ssh) {
    //console.log('Start SSH2')
    var ssh_config = socket.opts.ssh;
    var Client = require('ssh2').Client;
    var conn = new Client();
    conn.on('ready', function() {
      conn.forwardOut(info.srcAddr,
        info.srcPort,
        info.dstAddr,
        info.dstPort,
        function(err, stream) {
          if (err) {
            conn.end();
            return deny();
          }
          var clientSocket;
          if (clientSocket = accept(1)) { //console.log('clientSocket %j',clientSocket)

            stream.pipe(clientSocket).pipe(stream)
 
            stream.on('close', function() {
              conn.end();
            });
          } else {
            conn.end();
          }
        });
    }).on('error', function(err) {
      deny();
    }).connect(ssh_config);
  } else if (!socket.opts.onAccept) accept()

}

module.exports = {
  createServer: createSocksServer
};
