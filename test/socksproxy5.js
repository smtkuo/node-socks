const { socks5 } = require('../index');
var exec = require('child_process').exec;
var d = require('domain').create();
var cluster = require('cluster');

var numCPUs = require('os').cpus().length;

var execKill = function(pid) {
  if (process.platform == 'win32') {
    exec('taskkill /pid ' + pid + ' /T /F');
  } else if (process.platform == 'linux') {
    exec('kill -9 ' + pid);
  }
}  

d.run(function() {

  if (cluster.isMaster) {

    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    if (1 == numCPUs) cluster.fork(); //make sure it is more than 2

    cluster.on('exit', function(worker, code, signal) {
      if (worker.suicide !== true) {
        execKill(worker.process.pid);
      }
      var exitCode = worker.process.exitCode;
      console.log('worker ' + worker.process.pid + ' died (' + exitCode + '). restarting...');

      // 
      cluster.fork();

    });
  } else {
    // Workers can share any TCP connection
    // In this case its a proxy server

    // Create server
    // The server accepts SOCKS connections. This particular server acts as a proxy.
    var server5 = socks5.createServer({authorization:function(u,p){
		return u == 'user' && p == 'pass'
	}/*,fileBannedIPs:'./ip.txt',onAccept:function(socket, info, accept, deny){
		console.log(info)
		if(info.srcAddr == '::ffff:127.0.0.1'){
			return deny()
		}
		accept();
	},ssh:{
	  host: '103.92.28.100',
	  port: 22,
	  username: 'root',
	  password: 'xxxx'
	}*/});
 
  }
});

d.on('error', function(er) {
  // an error occurred somewhere.  
  // if we throw it now, it will crash the program  
  // with the normal line number and stack message.  
  console.log('ERROR!: %s ', er);

});
