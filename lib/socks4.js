var net = require('net'),
  util = require('util'),
  log = console.log,
  info = console.info,
  errorLog = console.error,
  clients = [],
  ips = [],
  SOCKS_VERSION = 4;
var fs = require("fs");

function createSocksServer(opts) {
  var defaultOpts = {
    port: 9999,
    timeout: 60000
  }
  opts = Object.assign({}, defaultOpts, opts ? opts : {});
  var PORT4 = opts.port,
    server4 = startSocksServer(opts);
  server4.on('error', function(e) {
    console.error('SERVER ERROR: %j', e);
    if (e.code == 'EADDRINUSE') {
      console.log('Address in use, retrying in 10 seconds...');
      setTimeout(function() {
        console.log('Reconnecting to %s', PORT);
        server4.close();
        server4.listen(PORT4);
      }, 10000);
    }
  });
  server4.listen(PORT4);
}

function startSocksServer(opts) {
  var fileBannedIPs = opts.fileBannedIPs
  var socksServer = net.createServer();
  if (fileBannedIPs) {
    initIplist(fileBannedIPs);
    fs.watch(fileBannedIPs, function(event, filename) {
      if (event == "change") {
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
    } else {
      initSocksConnection.bind(socket)(opts);
    }
  });
  return socksServer;
}
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

  // remove from clients on disconnect
  this.on('end', function() {
    var idx = clients.indexOf(this);
    if (idx != -1) {
      clients.splice(idx, 1);
    }
  });

  this.opts = opts

  // do a handshake
  this.handshake = handshake.bind(this);
  this.on('data', this.handshake);
}

function handshake(chunk) {
  log('handleRequest chunk', chunk);
  this.removeListener('data', this.handshake);

  // SOCKS Version 4 is the only support version
  if (chunk[0] != SOCKS_VERSION) {
    errorLog('handshake: wrong socks version: %d', chunk[0]);
    this.end();
  }

  var cmd = chunk[1],
    address,
    port,
    offset = 3,
    userid;

  port = chunk.readUInt16BE(2);
  //////////////////socks4a support
  if (chunk[4] == 0 && chunk[5] == 0 && chunk[6] == 0 && chunk[7] != 0) {
    var ad = chunk.toString('utf8', 8, chunk.length - 1).split("\0");
    userid = ad[0];
    address = ad[1];    
  } else {
    userid = chunk.toString('utf8', 8, chunk.length - 1);
    address = util.format('%s.%s.%s.%s', chunk[offset + 1], chunk[offset + 2], chunk[offset + 3], chunk[offset + 4]);
  }
  //log(userid+"--userid--");
  if (this.opts.authorization && !this.opts.authorization(userid)) {
    var resp = new Buffer(8);
    // rewrite response header
    resp[0] = 0x00;
    resp[1] = 93;
    this.write(resp);
    return
  }
  log(address + "--address--");
  this.request = chunk;
  this.proxy = net.createConnection(port, address, initProxy.bind(this));
  this.proxy.dstAddr = address;
  this.proxy.dstPort = port;
  this.proxy.on('error', function(had_error) {
    this.end();
    console.error('The Connection proxy error');
  }.bind(this));

  let deny = function() {
      try {
        this.end();
      } catch (e) {}
    }.bind(this),
    accept = function(v) {
      if (typeof v == "undefined" && this.opts.ssh) return false;
      if (typeof v != "undefined" && !v) return false;

      this.proxy.on('end', function(had_error) {
        this.removeAllListeners('data');
        this.proxy = undefined;
        this.end();
        //     errorLog('Proxy closed');
      }.bind(this));
      this.on('end', function(had_error) {
        if (this.proxy !== undefined) {
          this.proxy.removeAllListeners('data');
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
        this.destroy();
        clearTimeout(ss)
      }.bind(this));

      this.proxy.on('error', function(had_error) {
        this.destroy();
        clearTimeout(ss)
        //console.error('The proxy error');
      }.bind(this));

      let ss = this.setTimeout(this.opts.timeout, function(error) {
        if (this.proxy !== undefined) {
          this.proxy.removeAllListeners('data');
          this.proxy.end();
        }
        this.end();
        console.error(`socket timeout ${this.opts.timeout}ms`);
      }.bind(this));

      let ps = this.proxy.setTimeout(this.opts.timeout, function(error) {
        this.proxy.removeAllListeners('data');
        this.proxy.end();
        this.end();
        console.error(`proxy socket timeout ${this.opts.timeout}ms`);
      }.bind(this));

      if (typeof v == "undefined" || (v !== 1 && v !== true))
        return this.pipe(this.proxy).pipe(this);
      else
        return this.proxy.pipe(this);

    }.bind(this)
  if (this.opts.onAccept) {
    var info = {
      srcAddr: this.remoteAddress,
      srcPort: this.remotePort,
      dstAddr: this.proxy.dstAddr,
      dstPort: this.proxy.dstPort,
      numClients: clients.length
    }
    this.opts.onAccept.call(null, this, info, accept, deny)
  }
  if (this.opts.ssh) {
    var ssh_config = this.opts.ssh;
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
  } else if (!this.opts.onAccept) accept()
}

function initProxy() {
  log('Proxy connected');
  // creating response
  var resp = new Buffer(8);
  this.request.copy(resp, 0, 0, 7);
  // rewrite response header
  resp[0] = 0x00;
  resp[1] = 90;
  this.write(resp);

}

module.exports = {
  createServer: createSocksServer
};
