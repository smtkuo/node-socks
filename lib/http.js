var net = require('net'), ips=[], fs = require('fs');

function atob(a) {
    return new Buffer(a, 'base64').toString('binary');
};
var createServer = function(opts){
	opts = opts ? opts: {}
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
      
	  var idx = ips.indexOf(client.remoteAddress);
      if (idx != -1) {
          client.end();
          console.log('ip pass failed ');
		  return;
      }
	  var buffer = new Buffer(0);
	  client.on('data', function(data) {
		buffer = buffer_add(buffer, data);
		if (buffer_find_body(buffer) == -1) return;
		var req = parse_request(buffer);
		if (req === false) return;
		client.removeAllListeners('data');
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
		  
		  header = header.replace(/(proxy\-)connection\:.+\r\n/ig, '')
			.replace(/Keep\-Alive\:.+\r\n/i, '')
			.replace("\r\n", '\r\nConnection: close\r\n');
		  
		  if (req.httpVersion == '1.1') {
			var url = req.path.replace(/http\:\/\/[^\/]+/, '');
			if (url.path != url) header = header.replace(req.path, url);
		  }
		  buffer = buffer_add(new Buffer(header, 'utf8'), buffer.slice(_body_pos));
		}

		var server = net.createConnection(req.port, req.host);
		
		client.on("data", function(data) { 			 
		  try {
			server.write(data);
		  } catch (e) {}
		});
		server.on("data", function(data) {  
		  try {
			client.write(data);
		  } catch (e) {}
		});
		server.on("end", function(e) {
		  console.log("server close");
		  console.log(e);
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
		if (req.method == 'CONNECT')
		  client.write(new Buffer("HTTP/1.1 200 Connection established\r\nConnection: close\r\n\r\n"));
		else
		  server.write(buffer);
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
 * Method: GET/POST return { method,host,port,path,httpVersion }
 */
function parse_request(buffer) { 
  var s = buffer.toString('utf8');   
   
  var method = s.split('\n')[0].match(/^([A-Z]+)\s/)[1];
  if (method == 'CONNECT') {
    var arr = s.match(/^([A-Z]+)\s([^\:\s]+)\:(\d+)\sHTTP\/(\d\.\d)/);
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
    var arr = s.match(/^([A-Z]+)\s([^\s]+)\sHTTP\/(\d\.\d)/);
    if (arr && arr[1] && arr[2] && arr[3]) {
      var host = s.match(/Host\:\s+([^\n\s\r]+)/)[1];
      if (host) {
        var _p = host.split(':', 2);
        return {
          method: arr[1],
          host: _p[0],
          port: _p[1] ? _p[1] : 80,
          path: arr[2],
          httpVersion: arr[3]
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

module.exports = {createServer: createServer};