var net = require('net');
var proxyhost = "127.0.0.1"; //IP of the proxy service
var proxyport = 9999; //Port being proxied
var listenport = 8124; //Proxy port
net.createServer(function(socket) {
  console.log('CONNECTED %s:%s', socket.remoteAddress, socket.remotePort);
  try {
    var db = net.createConnection(proxyport, proxyhost);
    db.on("connect", function() {
      console.log("server connected");
      socket.on("data", function(data) {
        db.write(data);
      });
      db.on("data", function(data) {
        //console.log(data.toString('utf8',0,data.legnth)); 
        //console.log(data); 
        socket.write(data);
      });
      socket.on("close", function() {
        console.log("main server closed");
        try {
          db.end();
        } catch (e) {}
      });
    });
    db.on("error", function(data) {
      console.log("error:\r\n" + data);
      try {
        db.end();
        socket.end();
      } catch (e) {}
    });
    db.on("end", function() {
      console.log("server closed");
      try {
        socket.end();
      } catch (e) {}
    });
	socket.on("error", function(data) {
	  console.log("error:\r\n" + data);
	  try {
		db.end();		
	  } catch (e) {}
	});
  } catch (err) {
    console.log(err);
  }

}).listen(listenport, "127.0.0.1", function(e) {
  console.log(`Proxy listen on port ${listenport}`);
});
