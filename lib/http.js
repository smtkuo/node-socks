var net = require('net'), ips=[], fs = require('fs'), clients = [];

function atob(a) {
    return new Buffer(a, 'base64').toString('binary');
};
var createServer = function(opts){
	var defaultOpts = {
	  port: 8080,
	  timeout: 60000
    }	
    opts = Object.assign({}, defaultOpts, opts?opts:{});  
	var cbuserpass = opts.authorization;
	var fileBannedIPs = opts.fileBannedIPs;
	var local_port = opts.port || 8080;
	
	if(fileBannedIPs){
		initIplist(fileBannedIPs);
		fs.watch(fileBannedIPs,function(event,filename){
			if(event=="change")
			{
				initIplist(fileBannedIPs);
			}
		});
	}
	
	var sockserver = net.createServer(function(client) {
	  console.log('CONNECTED from  %s:%s', client.remoteAddress, client.remotePort);	
	  
	  clients.push(client);
	  
	  this.on('end', function() {
		var idx = clients.indexOf(this);
		if (idx != -1) {
		  clients.splice(idx, 1);
		}
	  });
      
	  var idx = ips.indexOf(client.remoteAddress);
      if (idx != -1) {
          client.end();
          console.log('ip pass failed ');
		  return;
      }
	  var buffer = new Buffer(0);
	  client.on('data', function(data) { //console.log('data:::',data+"")
	    client.request = data		
		buffer = buffer_add(buffer, data);
		if (buffer_find_body(buffer) == -1) return;
		var req = parse_request(buffer);
		if (req === false) return;
		client.removeAllListeners('data');
		client.req = req
		relay_connection(req);
	  });
	  
	  function relay_connection(req) { //console.log(req)
		console.log(req.method + ' ' + req.host + ':' + req.port);
		
		if(req.auth){
			var q = req.auth.split(':')
			if(cbuserpass && cbuserpass.call(null,q[0],q[1])){
				console.log(q[0],q[1]);
			}else{
				const buf = Buffer.from(new String('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'));
				client.end(buf);
			}
		}
 
		if (req.method != 'CONNECT') {
		    var _body_pos = buffer_find_body(buffer);
		    if (_body_pos < 0) _body_pos = buffer.length;
		    var header = buffer.slice(0, _body_pos).toString('utf8'); //console.log(header)
		  
		    header = header.replace(/(proxy\-)?connection\:.+\r\n/ig, '')
			.replace(/Keep\-Alive\:.+\r\n/i, '')
			.replace("\r\n", '\r\nConnection: close\r\n');
		    
		    if (req.httpVersion == '1.1') {
			  var url = req.path.replace(/http\:\/\/[^\/]+/, '');
			  if (req.path != url) header = header.replace(req.path, url);
		    }
		    buffer = buffer_add(new Buffer(header, 'utf8'), buffer.slice(_body_pos));	
			req = parse_request(buffer);	//console.log('req:',req)
			client.request = buffer;
			client.req = req;
		}
		let deny = function() {
		  try {
			client.end();
		  } catch (e) {}
		},
		accept = function(v) {
			if (typeof v == "undefined" && opts.ssh) return false;	
			if (typeof v != "undefined" && !v) return false;
			 
			var server = net.createConnection(req.port, req.host, proxyReady.bind(client)); 
			client.server = server;
			client.opts = opts;
			server.on("end", function(e) {
			  console.log("server close");
			  //console.log(e);
			  try {
				client.end();
			  } catch (e) {}
			});		
			server.on("error", function(e) {		   
			  try {
				client.destroy();
			  } catch (e) {}
			});
			client.on("end", function(e) {		 
			  try {
				server.end();
			  } catch (e) {}
			});
			client.on("error", function(e) {
			  try {
				server.destroy();
			  } catch (e) {}
			});
			 
			let ss = client.setTimeout(opts.timeout, function(error) {
				if (server !== undefined) {
				  server.removeAllListeners('data');
				  server.end();
				}		
				if (client.end)
				  client.end();
				console.error(`socket timeout ${opts.timeout}ms`);
			});

			let ps = server.setTimeout(opts.timeout, function(error) {
				server.removeAllListeners('data');
				server.end();
				if (client.end)
				  client.end();
				console.error(`proxy socket timeout ${opts.timeout}ms`);
			});
			 
			if (typeof v == "undefined" || (v !== 1 && v !== true))
				return client.pipe(server).pipe(client)
			else
				return client;//server.pipe(client);
		}
		
		var info = {
		  srcAddr: client.remoteAddress,
		  srcPort: client.remotePort,
		  dstAddr: req.host,
		  dstPort: req.port, 
		  numClients: clients.length
		};// console.log('info:',info)
		if (opts.onAccept) {			
			opts.onAccept.call(null, client, info, accept, deny)
		}
		if (opts.ssh) {
			console.log('Start SSH2')
			var ssh_config = opts.ssh;
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
					stream.write(clientSocket.request)
 
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
		} else if (!opts.onAccept) accept()
		
		
	  }
	});
 
	process.on('uncaughtException', function(err) {
	  console.log("\nError!!!!");
	  console.log(err);
	});

	sockserver.on('listening', function() {
	  var address = sockserver.address();
	  console.log('LISTENING %s:%s', address.address, address.port);
	});
	
	return sockserver.listen(local_port)
}

function proxyReady() {
  console.log('Indicating to the client that the proxy is ready');
  
  if (this.req.method == 'CONNECT')
	this.write(new Buffer("HTTP/1.1 200 Connection established\r\nConnection: close\r\n\r\n"));				  
  else {  
	  // creating response
	  var resp = new Buffer(this.request.length);
	  this.request.copy(resp);
	  console.log(resp+"")
	  if(!this.opts.ssh)	  
	  this.server.write(resp)
  }
}

//iplist
function initIplist(fileBannedIPs) {
    fs.readFile(fileBannedIPs,function(err,data){
        if(err) throw err;
        ips = data.toString('utf8',0,data.length).split(";");
    });
}

/**
 * Parse request
 * Method: CONNECT return { method,host,port,httpVersion,auth }
 * Method: GET/POST return { method,host,port,path,httpVersion,auth }
 */
function parse_request(buffer) { 
  var s = buffer.toString('utf8');
   
  var method = s.split('\n')[0].match(/^([A-Z]+)\s/)[1];
  if (method == 'CONNECT') {
    var arr = s.match(/^([A-Z]+)\s([^\:\s]+)\:(\d+)\sHTTP\/([0-9\.]+)/);
    if (arr && arr[1] && arr[2] && arr[3] && arr[4]){
		//detect Authorization		
		var ar = s.match(/Proxy-Authorization: Basic (.+)[\n\r]/i);		
		return {
			method: arr[1],
			host: arr[2],
			port: arr[3],
			httpVersion: arr[4],
			auth: ar?atob(ar[1]):''
		};
	}
      
  } else {
    var arr = s.match(/^([A-Z]+)\s([^\s]+)\sHTTP\/([0-9\.]+)/);
    if (arr && arr[1] && arr[2] && arr[3]) {
      var host = s.match(/Host\:\s+([^\n\s\r]+)/i)[1];
      if (host) {
        var _p = host.split(':', 2);
		//detect Authorization		
		var ar = s.match(/Proxy-Authorization: Basic (.+)[\n\r]/i);		
        return {
          method: arr[1],
          host: _p[0],
          port: _p[1] ? _p[1] : 80,
          path: arr[2],
          httpVersion: arr[3],
		  auth: ar?atob(ar[1]):''
        };
      }
    }
  }
  return false;
}
 
/**
 * Buffer add
 */
function buffer_add(buf1, buf2) {
  var re = new Buffer(buf1.length + buf2.length);
  buf1.copy(re);
  buf2.copy(re, buf1.length);
  return re;
}

/**
 * Buffer find body
 */
function buffer_find_body(b) {
  for (var i = 0, len = b.length - 3; i < len; i++) {
    if (b[i] == 0x0d && b[i + 1] == 0x0a && b[i + 2] == 0x0d && b[i + 3] == 0x0a) {
      return i + 4;
    }
  }
  return -1;
}

module.exports = {
	createServer: createServer, 
	parse_request: parse_request, 
	buffer_find_body: buffer_find_body,
	buffer_add: buffer_add
};